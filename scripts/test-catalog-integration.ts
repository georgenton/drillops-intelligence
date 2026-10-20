/** Synthetic PostgreSQL only; migration is deliberately NOT run by this script. */
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {Pool} from "pg";
import type {PrivateSession} from "../lib/private-auth";
async function main(){
 const url=new URL(process.env.DRILLOPS_TEST_ADMIN_URL??"postgresql://drillops_test:local-disposable-only@127.0.0.1:5448/drillops_test");
 assert.ok(["127.0.0.1","localhost"].includes(url.hostname)&&url.port==="5448"&&url.pathname==="/drillops_test","Refusing non-disposable DB");
 const admin=new Pool({connectionString:url.toString(),max:1});
 const role=`catalog_test_${randomBytes(5).toString("hex")}`,password=randomBytes(20).toString("hex");
 const tenants=[randomUUID(),randomUUID()],users=[randomUUID(),randomUUID()];
 let runtime:Pool|undefined;
 try{
  assert.equal((await admin.query("SELECT to_regclass('operational_catalog') IS NOT NULL AS ready")).rows[0].ready,true,"Main must migrate 0006 first");
  await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${password}'`);
  await admin.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await admin.query(`GRANT SELECT,INSERT,UPDATE ON operational_catalog,operational_catalog_revisions,operational_shifts TO ${role}`);
  for(let i=0;i<2;i++){
   await admin.query("INSERT INTO tenants(id,name,slug) VALUES($1,'Synthetic catalog test',$2)",[tenants[i],`catalog-test-${tenants[i]}`]);
   await admin.query("INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,'Synthetic catalog user','disabled-login')",[users[i],`${users[i]}@example.invalid`]);
  }
  url.username=role;url.password=password;process.env.DATABASE_URL=url.toString();
  const {operationalPool,tenantTransaction}=await import("../lib/operational-db");
  const {saveCatalog,readCatalog}=await import("../lib/operational-catalog");runtime=operationalPool();
  const session:PrivateSession={tenantId:tenants[0],userId:users[0],role:"general_manager",plan:"Premium",email:"synthetic@example.invalid",name:"Synthetic"};
  const other={...session,tenantId:tenants[1],userId:users[1]};
  const rig={kind:"rig",record:{code:"CAT-RIG",hourlyCostUsd:150},reason:"Synthetic configuration"};
  await saveCatalog(session,rig,"create");
  await saveCatalog(other,rig,"create"); // Same code is valid in another company.
  await saveCatalog(session,{kind:"hole",record:{code:"CAT-HOLE",rigCode:"CAT-RIG",targetDepthM:300,plannedMetersPerShift:20,planStartDate:"2026-05-01",guardsPerDay:2},reason:"Synthetic plan"},"create");
  const own=await readCatalog(session);
  assert.equal(own.rigs[0].hourlyCostUsd,150);assert.equal(own.holes[0].targetDepthM,300);
  assert.equal((await readCatalog(other)).holes.length,0);
  console.log("PASS catalog create/reload and company-scoped codes");
  const writes=await Promise.allSettled([saveCatalog(session,{...rig,revision:1},"update"),saveCatalog(session,{...rig,revision:1},"update")]);
  assert.equal(writes.filter(x=>x.status==="fulfilled").length,1);
  assert.equal((await readCatalog(session)).rigs[0].revision,2);
  assert.equal((await tenantTransaction(tenants[0],c=>c.query("SELECT * FROM operational_catalog_revisions WHERE kind='rig'"))).rowCount,2);
  console.log("PASS concurrent optimistic correction and audit history");
  const restricted=await readCatalog({...session,role:"operational_reviewer"});
  assert.equal("hourlyCostUsd" in restricted.rigs[0],false);
  await assert.rejects(saveCatalog({...session,role:"operational_reviewer"},rig,"create"),/FORBIDDEN/);
  await assert.rejects(saveCatalog({...session,role:"operations_supervisor"},{...rig,revision:2},"update"),/COST_FORBIDDEN/);
  await assert.rejects(saveCatalog(session,{kind:"hole",record:{code:"INVALID",rigCode:"FOREIGN"},reason:"Synthetic invalid"},"create"),/RIG_NOT_FOUND/);
  assert.equal((await readCatalog(session)).holes.length,1);
  console.log("PASS permissions, cost redaction and invalid rig rollback");
  const leaked=await tenantTransaction(tenants[1],c=>c.query("SELECT * FROM operational_catalog WHERE tenant_id=$1",[tenants[0]]));assert.equal(leaked.rowCount,0);
  assert.equal((await runtime.query("SELECT * FROM operational_catalog")).rowCount,0);
  await assert.rejects(tenantTransaction(tenants[1],c=>c.query("INSERT INTO operational_catalog(tenant_id,kind,code,payload) VALUES($1,'rig','FOREIGN','{\"code\":\"FOREIGN\"}')",[tenants[0]])),e=>(e as {code:string}).code==="42501");
  console.log("PASS FORCE RLS cross-company/missing-context denial");
 }finally{
  await runtime?.end();
  for(const tenant of tenants){
   await admin.query("DELETE FROM operational_catalog_revisions WHERE tenant_id=$1",[tenant]);
   await admin.query("DELETE FROM operational_catalog WHERE tenant_id=$1",[tenant]);
   await admin.query("DELETE FROM tenants WHERE id=$1",[tenant]);
  }
  for(const user of users)await admin.query("DELETE FROM users WHERE id=$1",[user]);
  if((await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1",[role])).rowCount){
   await admin.query(`DROP OWNED BY ${role}`);await admin.query(`DROP ROLE ${role}`);
  }
  await admin.end();
 }
}
main().catch(e=>{console.error(e instanceof Error?e.message:"Catalog integration failed");process.exitCode=1;});
