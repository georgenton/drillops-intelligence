/** Runs only against the disposable local test DB; never migrates it. */
import assert from "node:assert/strict";
import {randomUUID,randomBytes} from "node:crypto";
import {Pool} from "pg";
import type {PrivateSession} from "../lib/private-auth";
async function main(){
 const url=new URL(process.env.DRILLOPS_TEST_ADMIN_URL??"postgresql://drillops_test:local-disposable-only@127.0.0.1:5448/drillops_test");
 assert.ok(["localhost","127.0.0.1"].includes(url.hostname)&&url.port==="5448"&&url.pathname==="/drillops_test","Refusing non-disposable DB");
 const admin=new Pool({connectionString:url.toString(),max:1}),role=`quick_test_${randomBytes(5).toString("hex")}`,password=randomBytes(20).toString("hex");
 const tenant=randomUUID(),other=randomUUID(),user=randomUUID();let runtime:Pool|undefined;
 try{
  assert.equal((await admin.query("SELECT to_regclass('operational_quick_records') IS NOT NULL AS ready")).rows[0].ready,true,"Main must migrate 0008 first");
  await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${password}'`);
  await admin.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await admin.query(`GRANT SELECT,INSERT,UPDATE ON operational_quick_records,operational_shifts TO ${role}`);
  for(const id of [tenant,other])await admin.query("INSERT INTO tenants(id,name,slug) VALUES($1,'Synthetic quick records',$2)",[id,`quick-test-${id}`]);
  await admin.query("INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,'Synthetic quick operator','disabled-login')",[user,`${user}@example.invalid`]);
  const shift={logicalKey:"quick-test-shift",rigCode:"QUICK-RIG",holeCode:"QUICK-HOLE",date:"2026-05-01",shiftType:"day",startDepthM:10,endDepthM:20,advanceM:10,drillingHours:5,totalHours:12};
  await admin.query("INSERT INTO operational_shifts(tenant_id,logical_key,payload) VALUES($1,$2,$3)",[tenant,shift.logicalKey,JSON.stringify(shift)]);
  url.username=role;url.password=password;process.env.DATABASE_URL=url.toString();
  const {operationalPool,tenantTransaction}=await import("../lib/operational-db");runtime=operationalPool();
  const {saveQuickRecord,readQuickRecords}=await import("../lib/quick-operation-records");
  const session:PrivateSession={tenantId:tenant,userId:user,role:"operations_supervisor",plan:"Premium",email:"synthetic@example.invalid",name:"Synthetic"};
  const base={requestId:randomUUID(),logicalKey:shift.logicalKey,shiftRevision:1,reason:"Synthetic detail"};
  const interval={...base,kind:"interval",record:{startDepthM:10,endDepthM:11.5,minutes:20}};
  const replay=await Promise.all([saveQuickRecord(session,interval),saveQuickRecord(session,interval)]);
  assert.equal(replay.filter(r=>r.duplicate).length,1);
  const overlapping=await Promise.allSettled([saveQuickRecord(session,{...interval,requestId:randomUUID(),record:{startDepthM:13,endDepthM:16,minutes:30}}),saveQuickRecord(session,{...interval,requestId:randomUUID(),record:{startDepthM:14,endDepthM:17,minutes:30}})]);
  assert.equal(overlapping.filter(r=>r.status==="fulfilled").length,1);
  console.log("PASS quick request idempotency and concurrent overlap protection");
  for(const [kind,record] of [
   ["event",{label:"Revisión",hours:1,time:"10:00"}],
   ["crown_change",{previousSerial:"OLD",nextSerial:"NEW",depthM:17,time:null}],
   ["consumption",{item:"Agua",quantity:25,unit:"L"}],
  ])await saveQuickRecord(session,{...base,requestId:randomUUID(),kind,record});
  const saved=await readQuickRecords(session,shift.logicalKey);assert.equal(saved.length,5);
  const persisted=await admin.query("SELECT payload,revision FROM operational_shifts WHERE tenant_id=$1 AND logical_key=$2",[tenant,shift.logicalKey]);
  assert.deepEqual(persisted.rows[0],{payload:shift,revision:1});
  console.log("PASS all four flows persist without changing shift totals or source snapshots");
  await assert.rejects(saveQuickRecord({...session,role:"operational_reviewer"},interval),/FORBIDDEN/);
  await assert.rejects(saveQuickRecord({...session,tenantId:other},{...interval,requestId:randomUUID()}),/SHIFT_NOT_FOUND/);
  assert.equal((await readQuickRecords({...session,tenantId:other})).length,0);
  assert.equal((await readQuickRecords({...session,role:"control"})).length,1);
  assert.equal((await runtime.query("SELECT * FROM operational_quick_records")).rowCount,0);
  assert.equal((await tenantTransaction(other,c=>c.query("SELECT * FROM operational_quick_records WHERE tenant_id=$1",[tenant]))).rowCount,0);
  await assert.rejects(tenantTransaction(other,c=>c.query("INSERT INTO operational_quick_records(tenant_id,logical_key,request_id,kind,payload,shift_revision,reason,actor_id) VALUES($1,$2,$3,'event','{}',1,'Denied insert',$4)",[tenant,shift.logicalKey,randomUUID(),user])),e=>(e as {code:string}).code==="42501");
  console.log("PASS read-only role, per-section reading, foreign shift and RLS denial");
 }finally{
  await runtime?.end();
  await admin.query("DELETE FROM operational_quick_records WHERE tenant_id=$1",[tenant]);
  await admin.query("DELETE FROM operational_shifts WHERE tenant_id=$1",[tenant]);
  for(const id of [tenant,other])await admin.query("DELETE FROM tenants WHERE id=$1",[id]);
  await admin.query("DELETE FROM users WHERE id=$1",[user]);
  if((await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1",[role])).rowCount){await admin.query(`DROP OWNED BY ${role}`);await admin.query(`DROP ROLE ${role}`);}
  await admin.end();
 }
}
main().catch(e=>{console.error(e instanceof Error?e.message:"Quick integration failed");process.exitCode=1;});
