import {readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {parseOperationalArchive} from "../packages/import/may-2026";
import {backfillOperationalReports} from "../lib/operational-backfill";
import {operationalPool} from "../lib/operational-db";
import type {PrivateSession} from "../lib/private-auth";
/** DB credentials only through DATABASE_URL, never arguments or output. */
async function main(){
 const [source,tenantId,actorId,output,applyDigest]=process.argv.slice(2);
 if(process.env.DRILLOPS_ENV!=="staging")throw new Error("STAGING_ONLY");
 if(!source||!tenantId||!actorId||!output)throw new Error("USAGE: source.zip tenant-uuid actor-uuid private-plan.json [dry-run-digest]");
 if(applyDigest&&(!/^[a-f0-9]{64}$/.test(applyDigest)||!process.env.DRILLOPS_BACKUP_REFERENCE))throw new Error("EXACT_DRY_RUN_AND_BACKUP_REQUIRED");
 const pool=operationalPool();
 try{
  const identity=await pool.query<PrivateSession>(`SELECT u.id AS "userId",u.name,u.email,m.tenant_id AS "tenantId",m.role::text AS role,'Premium' AS plan
    FROM users u JOIN memberships m ON m.user_id=u.id JOIN tenants t ON t.id=m.tenant_id
    WHERE u.id=$1 AND m.tenant_id=$2 AND t.active=true AND m.role::text='general_manager'`,[actorId,tenantId]);
  if(identity.rows.length!==1)throw new Error("AUTHORIZED_MAINTENANCE_ACTOR_REQUIRED");
  const parsed=parseOperationalArchive(await readFile(source));
  const result=await backfillOperationalReports(identity.rows[0],parsed,applyDigest);
  await writeFile(resolve(output),JSON.stringify(result,null,2),{mode:0o600,flag:"wx"});
  console.log(JSON.stringify("changes" in result?{applied:false,digest:result.digest,shiftsChanged:result.changes.length,conflicts:result.conflicts.length,reportCount:result.reportCount,reportCounts:result.reportCounts}:result));
 }finally{await pool.end();}
}
main().catch(()=>{console.error("Backfill failed; inspect privately. No secrets printed.");process.exitCode=1;});
