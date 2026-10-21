import type {PrivateSession} from "./private-auth";
import {tenantTransaction} from "./operational-db";
import {writeOperationalReports} from "./operational-report-store";
import {planOperationalBackfill,type StoredReportState} from "@/packages/import/backfill";
import type {OperationalImport,OperationalShift} from "@/packages/import/types";
/** Internal maintenance only. No HTTP route. Exact dry-run digest required to apply. */
export async function backfillOperationalReports(session:PrivateSession,parsed:OperationalImport,applyDigest?:string){
 if(parsed.issues.some(i=>i.severity==="error"))throw new Error("BACKFILL_SOURCE_VALIDATION_FAILED");
 return tenantTransaction(session.tenantId,async client=>{
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[session.tenantId]);
  const rows=await client.query<{payload:OperationalShift;revision:number}>("SELECT payload,revision FROM operational_shifts WHERE tenant_id=$1 ORDER BY logical_key FOR UPDATE",[session.tenantId]);
  for(const report of [...parsed.operationalReports??[]].sort((a,b)=>a.key.localeCompare(b.key)))await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`${session.tenantId}|report|${report.key}`]);
  const reports=await client.query<StoredReportState>('SELECT payload,revision,adapter_version AS "adapterVersion" FROM operational_reports WHERE tenant_id=$1 ORDER BY logical_key FOR UPDATE',[session.tenantId]);
  const plan=planOperationalBackfill(rows.rows.map(r=>({...r.payload,revision:r.revision})),parsed,reports.rows);
  if(!applyDigest)return {...plan,applied:false};
  if(plan.conflicts.length||plan.digest!==applyDigest)throw new Error("BACKFILL_PLAN_CONFLICT");
  for(const change of plan.changes){
   await client.query("INSERT INTO operational_revisions(tenant_id,logical_key,previous_payload,next_payload,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6)",[session.tenantId,change.logicalKey,JSON.stringify(change.previous),JSON.stringify(change.next),`Cobertura de fuente ${parsed.adapterVersion}; ${plan.digest}`,session.userId]);
   await client.query("UPDATE operational_shifts SET payload=$1,revision=revision+1,updated_at=now() WHERE tenant_id=$2 AND logical_key=$3 AND revision=$4",[JSON.stringify(change.next),session.tenantId,change.logicalKey,change.revision]);
  }
  const reportsChanged=await writeOperationalReports(client,session.tenantId,plan.reportChanges.map(r=>r.next),parsed.adapterVersion,session.userId);
  return {digest:plan.digest,applied:true,shiftsChanged:plan.changes.length,reportsChanged};
 });
}
