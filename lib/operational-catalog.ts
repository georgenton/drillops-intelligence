import type { PoolClient } from "pg";
import { tenantTransaction } from "./operational-db";
import type { PrivateSession } from "./private-auth";
import { canAccessSection, canViewOperationalCosts, canWriteManualRecord, planCatalog } from "./access-control";
import { catalogMutationSchema, holeCatalogSchema, rigCatalogSchema,crownCatalogSchema, type CatalogMutation, type OperationalCatalog, type RigCatalogRecord, type HoleCatalogRecord,type CrownCatalogRecord } from "@/packages/domain/operational-catalog";

type CatalogSession = Pick<PrivateSession,"tenantId"|"userId"|"role"|"plan"|"demo">;
export function catalogCapabilities(session:CatalogSession) {
  return {
    canWriteRigs:!session.demo&&canWriteManualRecord(session.role,session.plan,"rig"),
    canWriteHoles:!session.demo&&canWriteManualRecord(session.role,session.plan,"drillhole"),
    canWriteCrowns:!session.demo&&canWriteManualRecord(session.role,session.plan,"crown"),
    canConfigureCosts:!session.demo&&canWriteManualRecord(session.role,session.plan,"rig")&&canViewOperationalCosts(session.role),
  };
}
export function assertCatalogWrite(session:CatalogSession,input:CatalogMutation) {
  const caps=catalogCapabilities(session);
  if(!(input.kind==="rig"?caps.canWriteRigs:input.kind==="hole"?caps.canWriteHoles:caps.canWriteCrowns))throw new Error("FORBIDDEN");
  if(input.kind==="rig"&&input.record.hourlyCostUsd!==undefined&&!caps.canConfigureCosts)throw new Error("COST_FORBIDDEN");
  if(input.kind==="crown"&&input.record.priceUsd!==undefined&&!canViewOperationalCosts(session.role))throw new Error("COST_FORBIDDEN");
  if(input.kind==="hole"&&input.record.surveyConfiguration&&!canAccessSection({...session,section:"survey"}))throw new Error("FORBIDDEN");
}
export function redactCatalog(catalog:OperationalCatalog,session:CatalogSession):OperationalCatalog {
  return {...catalog,...catalogCapabilities(session),
    rigs:catalog.rigs.map(r=>{const copy={...r};if(!canViewOperationalCosts(session.role))delete copy.hourlyCostUsd;return copy;}),
    crowns:canAccessSection({...session,section:"coronas"})?catalog.crowns.map(r=>{const copy={...r};if(!canViewOperationalCosts(session.role))delete copy.priceUsd;return copy;}):[],
    holes:catalog.holes.map(h=>({...h,surveyConfiguration:canAccessSection({...session,section:"survey"})?h.surveyConfiguration:null})),
  };
}
export async function readCatalogWithClient(client:PoolClient,tenantId:string):Promise<OperationalCatalog> {
  const stored=await client.query<{kind:"rig"|"hole"|"crown";payload:Record<string,unknown>;revision:number}>("SELECT kind,payload,revision FROM operational_catalog WHERE tenant_id=$1 ORDER BY code",[tenantId]);
  const observed=await client.query<{rig:string;hole:string|null}>("SELECT DISTINCT upper(btrim(payload->>'rigCode')) AS rig,upper(btrim(payload->>'holeCode')) AS hole FROM operational_shifts WHERE tenant_id=$1",[tenantId]);
  const rigs=new Map<string,RigCatalogRecord>();
  const holes=new Map<string,HoleCatalogRecord>();
  const crowns=new Map<string,CrownCatalogRecord>();
  for(const row of observed.rows){
    if(!row.rig)continue;
    rigs.set(row.rig,{...rigCatalogSchema.parse({code:row.rig}),hourlyCostUsd:null,revision:0,source:"observed"});
    if(row.hole)holes.set(`${row.hole}|${row.rig}`,{...holeCatalogSchema.parse({code:row.hole,rigCode:row.rig}),revision:0,source:"observed"});
  }
  for(const row of stored.rows){
    if(row.kind==="rig"){const record=rigCatalogSchema.parse(row.payload);rigs.set(record.code,{...record,revision:row.revision,source:"configured"});}
    else if(row.kind==="hole"){
      const record=holeCatalogSchema.parse(row.payload);
      // A configured association is authoritative for that hole; historic shifts remain unchanged.
      for(const [key,hole] of holes)if(hole.code===record.code)holes.delete(key);
      holes.set(`${record.code}|${record.rigCode}`,{...record,revision:row.revision,source:"configured"});
    }
    else {const record=crownCatalogSchema.parse(row.payload);crowns.set(record.code,{...record,revision:row.revision,source:"configured"});}
  }
  return {rigs:[...rigs.values()].sort((a,b)=>a.code.localeCompare(b.code)),holes:[...holes.values()].sort((a,b)=>a.code.localeCompare(b.code)),crowns:[...crowns.values()].sort((a,b)=>a.code.localeCompare(b.code)),canWriteRigs:false,canWriteHoles:false,canWriteCrowns:false,canConfigureCosts:false};
}
export async function readCatalog(session:CatalogSession) {
  return tenantTransaction(session.tenantId,async client=>redactCatalog(await readCatalogWithClient(client,session.tenantId),session));
}
export async function saveCatalog(session:CatalogSession,raw:unknown,mode:"create"|"update") {
  const input=catalogMutationSchema.parse(raw);
  assertCatalogWrite(session,input);
  if(mode==="update"&&input.revision===undefined)throw new Error("REVISION_REQUIRED");
  if(mode==="create"&&input.revision!==undefined)throw new Error("INVALID_CREATE_REVISION");
  return tenantTransaction(session.tenantId,async client=>{
    // Serializes catalog capacity/association checks as well as same-code concurrent creates.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`${session.tenantId}|catalog`]);
    const old=await client.query<{payload:Record<string,unknown>;revision:number}>("SELECT payload,revision FROM operational_catalog WHERE tenant_id=$1 AND kind=$2 AND code=$3 FOR UPDATE",[session.tenantId,input.kind,input.record.code]);
    const prior=old.rows[0];
    if(mode==="create"&&prior)throw new Error("ALREADY_EXISTS");
    if(mode==="update"&&!prior)throw new Error("NOT_FOUND");
    if(mode==="update"&&prior.revision!==input.revision)throw new Error("REVISION_CONFLICT");
    const catalog=await readCatalogWithClient(client,session.tenantId);
    if(input.kind==="hole"&&!catalog.rigs.some(r=>r.code===input.record.rigCode))throw new Error("RIG_NOT_FOUND");
    if(input.kind==="crown"&&input.record.mseCalibration){
      const config=input.record.mseCalibration;
      if(!catalog.rigs.some(r=>r.code===config.rigCode)||!catalog.holes.some(h=>h.code===config.holeCode&&h.rigCode===config.rigCode))throw new Error("RIG_NOT_FOUND");
    }
    if(input.kind==="rig"&&!catalog.rigs.some(r=>r.code===input.record.code)){
      const limit=planCatalog[session.plan].machineLimit;
      if(limit!==null&&catalog.rigs.length>=limit)throw new Error("MACHINE_LIMIT");
    }
    const payload=input.kind==="rig"?{...input.record,hourlyCostUsd:input.record.hourlyCostUsd===undefined?prior?.payload.hourlyCostUsd??null:input.record.hourlyCostUsd}:
      input.kind==="crown"?{...input.record,priceUsd:input.record.priceUsd===undefined?prior?.payload.priceUsd??null:input.record.priceUsd}:
      {...input.record,surveyConfiguration:canAccessSection({...session,section:"survey"})?input.record.surveyConfiguration:prior?.payload.surveyConfiguration??null};
    const revision=(prior?.revision??0)+1;
    await client.query(`INSERT INTO operational_catalog(tenant_id,kind,code,payload,revision) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(tenant_id,kind,code) DO UPDATE SET payload=EXCLUDED.payload,revision=EXCLUDED.revision,updated_at=now()`,
    [session.tenantId,input.kind,input.record.code,JSON.stringify(payload),revision]);
    await client.query("INSERT INTO operational_catalog_revisions(tenant_id,kind,code,previous_payload,next_payload,revision,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [session.tenantId,input.kind,input.record.code,prior?.payload??null,JSON.stringify(payload),revision,input.reason,session.userId]);
    return {ok:true,kind:input.kind,code:input.record.code,revision};
  });
}
