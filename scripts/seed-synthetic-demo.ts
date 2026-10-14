import { Pool } from "pg";
import type { CrownSnapshot, OperationalShift } from "../packages/import/types";
async function main(){
 if(process.env.DRILLOPS_ENV!=="demo"||!process.env.DATABASE_URL)throw Error("Explicit demo target required");
 const db=new Pool({connectionString:process.env.DATABASE_URL});const c=await db.connect();
 try{await c.query("BEGIN");
 const t=await c.query("INSERT INTO tenants(name,slug,settings) VALUES('Operación sintética','synthetic-demo',$1) ON CONFLICT(slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id",[JSON.stringify({plan:"Premium"})]);
 const u=await c.query("INSERT INTO users(email,name,password_hash) VALUES('public@synthetic.invalid','Visitante demo','PASSWORD_LOGIN_DISABLED') ON CONFLICT(email) DO UPDATE SET email=EXCLUDED.email RETURNING id");
 await c.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'operations_supervisor') ON CONFLICT(tenant_id,user_id) DO NOTHING",[t.rows[0].id,u.rows[0].id]);
 await c.query("SELECT set_config('app.tenant_id',$1,true)",[t.rows[0].id]);
 for(let day=1;day<=14;day++)for(let rig=1;rig<=2;rig++)for(const shiftType of ["day","night"] as const){
  const date=`2026-05-${String(day).padStart(2,"0")}`,startDepthM=((day-1)*2+(shiftType==="night"?1:0))*12;
  const crown:CrownSnapshot={key:`synthetic-crown-${rig}`,date,rigCode:`SYN-RIG-${rig}`,holeCode:`SYN-HOLE-${rig}`,type:"HQ sintético",brand:"Fabricante ilustrativo",serial:`SYN-CROWN-${rig}`,startDepthM:0,endDepthM:336,observedMetres:336,source:{file:"synthetic-generator-v1",fileSha256:"synthetic",sheet:`SYN-RIG-${rig}`,row:0,cells:{}},warnings:["SYNTHETIC_NOT_CLIENT_DATA"]};
  const shift:OperationalShift&{crowns:CrownSnapshot[]}={logicalKey:`synthetic-${day}-${rig}-${shiftType}`,date,rigCode:crown.rigCode,holeCode:crown.holeCode,projectCode:"DEMO",shiftType,granularity:"shift",startDepthM,endDepthM:startDepthM+12,advanceM:12,drillingHours:5+(day%3)*0.5,totalHours:12,activities:[{label:"PERFORACIÓN",hours:5+(day%3)*0.5,cell:"synthetic"}],parameters:{rpm:null,torque:null,torqueUnit:null,pulldownPsi:null,holdbackPsi:null},source:{file:"synthetic-generator-v1",fileSha256:"synthetic",sheet:crown.rigCode,cells:{}},warnings:["SYNTHETIC_NOT_CLIENT_DATA"],crowns:[crown]};
  await c.query("INSERT INTO operational_shifts(tenant_id,logical_key,payload) VALUES($1,$2,$3) ON CONFLICT(tenant_id,logical_key) DO NOTHING",[t.rows[0].id,shift.logicalKey,JSON.stringify(shift)]);
 }
 await c.query("COMMIT");console.log("Synthetic demo seeded:56 shifts; no client originals/catalog/prices");
 }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();await db.end();}
}
main().catch(()=>{console.error("Synthetic demo seed failed");process.exitCode=1;});
