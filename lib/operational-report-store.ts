import type { PoolClient } from "pg";
import type { OperationalReport } from "@/packages/import/types";
export async function writeOperationalReports(client:PoolClient,tenantId:string,reports:OperationalReport[],adapterVersion:string,actorId:string|null=null){
 let changed=0;
 for(const report of reports){
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`${tenantId}|report|${report.key}`]);
  const old=await client.query("SELECT payload,adapter_version,payload=$3::jsonb AS same FROM operational_reports WHERE tenant_id=$1 AND logical_key=$2 FOR UPDATE",[tenantId,report.key,JSON.stringify(report)]);
  if(old.rows[0]?.same)continue;
  if(old.rows[0]?.adapter_version.startsWith("manual")&&!adapterVersion.startsWith("manual"))throw new Error("MANUAL_REPORT_CONFLICT");
  const r=await client.query(`INSERT INTO operational_reports(tenant_id,logical_key,payload,adapter_version) VALUES($1,$2,$3,$4)
   ON CONFLICT(tenant_id,logical_key) DO UPDATE SET payload=EXCLUDED.payload,adapter_version=EXCLUDED.adapter_version,
   revision=operational_reports.revision+1,updated_at=now()
   WHERE operational_reports.payload IS DISTINCT FROM EXCLUDED.payload`,[tenantId,report.key,JSON.stringify(report),adapterVersion]);
  changed+=r.rowCount??0;
  if(r.rowCount)await client.query("INSERT INTO operational_report_revisions(tenant_id,logical_key,previous_payload,next_payload,adapter_version,actor_id) VALUES($1,$2,$3,$4,$5,$6)",[tenantId,report.key,old.rows[0]?.payload??null,JSON.stringify(report),adapterVersion,actorId]);
 }
 return changed;
}
export async function readOperationalReports(client:PoolClient,tenantId:string){
 const exists=await client.query("SELECT to_regclass('public.operational_reports') IS NOT NULL AS present");
 if(!exists.rows[0].present)return [];
 return (await client.query<{payload:OperationalReport}>("SELECT payload FROM operational_reports WHERE tenant_id=$1 ORDER BY payload->>'date',logical_key",[tenantId])).rows.map(r=>r.payload);
}
