import { tenantTransaction } from "./operational-db";
import {readOperationalReports,writeOperationalReports} from "./operational-report-store";
import type { PrivateSession } from "./private-auth";
import type { CrownSnapshot, OperationalImport, OperationalShift } from "@/packages/import/types";
export type StoredShift = OperationalShift & { revision: number; crowns: CrownSnapshot[] };
export type OperationalFilters = { from?: string; to?: string; rig?: string; hole?: string };
export function summarize(shifts: OperationalShift[]) {
  const sum = (values: Array<number | null>) => values.filter((v): v is number => v !== null).reduce((a,b)=>a+b,0);
  const advanceM=sum(shifts.map(s=>s.advanceM));
  const drillingHours=sum(shifts.map(s=>s.drillingHours));
  const paired=shifts.filter(s=>s.advanceM!==null&&s.drillingHours!==null&&(s.drillingHours>0||s.advanceM===0));
  const pairedHours=sum(paired.map(s=>s.drillingHours));
  const byDay: Record<string,{metres:number;hours:number}>={};
  for(const s of shifts) { const day=byDay[s.date]??={metres:0,hours:0}; day.metres+=s.advanceM??0;day.hours+=s.drillingHours??0; }
  return {advanceM,drillingHours,ropMPerHour:pairedHours>0?sum(paired.map(s=>s.advanceM))/pairedHours:null,ropCoverage:paired.length,shiftCount:shifts.length,
    missingAdvance:shifts.filter(s=>s.advanceM===null).length,missingHours:shifts.filter(s=>s.drillingHours===null).length,
    rigs:[...new Set(shifts.map(s=>s.rigCode))],holes:[...new Set(shifts.map(s=>s.holeCode).filter(Boolean))],
    byDay:Object.entries(byDay).sort(([a],[b])=>a.localeCompare(b)).map(([date,d])=>({date,...d}))};
}
export async function readOperation(tenantId:string, filters:OperationalFilters={}) {
  return tenantTransaction(tenantId,async client=>{
    const rows=await client.query<{payload:OperationalShift & {crowns:CrownSnapshot[]};revision:number}>("SELECT payload,revision FROM operational_shifts WHERE tenant_id=$1 ORDER BY payload->>'date',payload->>'rigCode',payload->>'shiftType'",[tenantId]);
    const all=rows.rows.map(r=>({...r.payload,revision:r.revision}));
    const shifts=all.filter(s=>(!filters.from||s.date>=filters.from)&&(!filters.to||s.date<=filters.to)&&(!filters.rig||s.rigCode===filters.rig)&&(!filters.hole||s.holeCode===filters.hole));
    const decisions=await client.query("SELECT id,payload,created_at FROM operational_decisions WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100",[tenantId]);
    const snapshots=shifts.flatMap(s=>s.crowns??[]);
    const crowns=[...new Map(snapshots.map(s=>[`${s.date}|${s.key}`,s])).values()];
    const scopedDecisions=decisions.rows.filter(d=>Object.entries(filters).every(([key,value])=>!value||d.payload.filters?.[key]===value));
    const reports=(await readOperationalReports(client,tenantId)).filter(s=>(!filters.from||s.date>=filters.from)&&(!filters.to||s.date<=filters.to)&&(!filters.rig||s.rigCode===filters.rig)&&(!filters.hole||s.holeCode===filters.hole));
    return {source:"database" as const,filters,summary:summarize(shifts),shifts,crowns,reports,decisions:scopedDecisions,
      availableRigs:[...new Set(all.map(s=>s.rigCode))],availableHoles:[...new Set(all.map(s=>s.holeCode).filter(Boolean))]};
  });
}
export async function commitImport(session:PrivateSession, parsed:OperationalImport) {
  if(parsed.issues.some(i=>i.severity==="error")) throw new Error("IMPORT_VALIDATION_FAILED");
  return tenantTransaction(session.tenantId,async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[session.tenantId]);
    const existing=await client.query("SELECT id,result FROM operational_imports WHERE tenant_id=$1 AND source_hash=$2 AND adapter_version=$3",[session.tenantId,parsed.archiveSha256,parsed.adapterVersion]);
    if(existing.rows.length) return {...existing.rows[0],duplicate:true};
    const job=await client.query("INSERT INTO operational_imports(tenant_id,source_hash,adapter_version,actor_id,result) VALUES($1,$2,$3,$4,$5) RETURNING id",[session.tenantId,parsed.archiveSha256,parsed.adapterVersion,session.userId,JSON.stringify(parsed.summary)]);
    let inserted=0,updated=0,unchanged=0;
    for(const shift of parsed.shifts) {
      const payload={...shift,crowns:parsed.crownSnapshots.filter(c=>c.date===shift.date&&c.rigCode===shift.rigCode&&c.holeCode===shift.holeCode)};
      const old=await client.query("SELECT payload FROM operational_shifts WHERE tenant_id=$1 AND logical_key=$2 FOR UPDATE",[session.tenantId,shift.logicalKey]);
      if(old.rows[0]?.payload.warnings?.some((w:string)=>w.startsWith("MANUAL_CORRECTION"))) throw new Error("MANUAL_CORRECTION_CONFLICT");
      if(old.rows.length&&JSON.stringify(old.rows[0].payload)===JSON.stringify(payload)) {unchanged++;continue;}
      // JSONB equality is key-order independent; file hashes intentionally retain revision provenance.
      const same=old.rows.length?await client.query("SELECT $1::jsonb=$2::jsonb AS same",[old.rows[0].payload,JSON.stringify(payload)]):null;
      if(same?.rows[0].same){unchanged++;continue;}
      await client.query("INSERT INTO operational_revisions(tenant_id,logical_key,previous_payload,next_payload,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6)",[session.tenantId,shift.logicalKey,old.rows[0]?.payload??null,JSON.stringify(payload),"Importación revisada "+parsed.adapterVersion,session.userId]);
      await client.query(`INSERT INTO operational_shifts(tenant_id,logical_key,payload,import_id) VALUES($1,$2,$3,$4)
        ON CONFLICT(tenant_id,logical_key) DO UPDATE SET payload=EXCLUDED.payload,import_id=EXCLUDED.import_id,revision=operational_shifts.revision+1,updated_at=now()`,[session.tenantId,shift.logicalKey,JSON.stringify(payload),job.rows[0].id]);
      if(old.rows.length) updated++;else inserted++;
    }
    const reportsUpdated=await writeOperationalReports(client,session.tenantId,parsed.operationalReports??[],parsed.adapterVersion,session.userId);
    const result={...parsed.summary,inserted,updated,unchanged,reportsUpdated};
    await client.query("UPDATE operational_imports SET result=$1 WHERE id=$2 AND tenant_id=$3",[JSON.stringify(result),job.rows[0].id,session.tenantId]);
    return {id:job.rows[0].id,result,duplicate:false};
  });
}
export async function correctShift(session:PrivateSession,input:{logicalKey:string;revision:number;advanceM:number;drillingHours:number;reason:string}) {
  return tenantTransaction(session.tenantId,async client=>{
    const old=await client.query("SELECT payload,revision FROM operational_shifts WHERE tenant_id=$1 AND logical_key=$2 FOR UPDATE",[session.tenantId,input.logicalKey]);
    if(!old.rows.length) throw new Error("NOT_FOUND");
    if(old.rows[0].revision!==input.revision) throw new Error("REVISION_CONFLICT");
    const payload={...old.rows[0].payload,advanceM:input.advanceM,drillingHours:input.drillingHours,warnings:[...old.rows[0].payload.warnings,"MANUAL_CORRECTION: depths preserved; advance independently corrected"]};
    await client.query("INSERT INTO operational_revisions(tenant_id,logical_key,previous_payload,next_payload,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6)",[session.tenantId,input.logicalKey,old.rows[0].payload,JSON.stringify(payload),input.reason,session.userId]);
    await client.query("UPDATE operational_shifts SET payload=$1,revision=revision+1,updated_at=now() WHERE tenant_id=$2 AND logical_key=$3",[JSON.stringify(payload),session.tenantId,input.logicalKey]);
    return {ok:true};
  });
}
