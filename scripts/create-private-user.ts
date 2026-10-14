import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { canonicalRoles } from "../lib/access-control";
async function main(){
 const {DATABASE_URL,PRIVATE_USER_EMAIL,PRIVATE_USER_NAME,PRIVATE_USER_PASSWORD,PRIVATE_TENANT_SLUG,PRIVATE_USER_ROLE}=process.env;
 if(!DATABASE_URL||!PRIVATE_USER_EMAIL||!PRIVATE_USER_NAME||!PRIVATE_USER_PASSWORD||PRIVATE_USER_PASSWORD.length<14||!PRIVATE_TENANT_SLUG||!canonicalRoles.includes(PRIVATE_USER_ROLE as never))throw Error("Missing secure provisioning inputs");
 const pool=new Pool({connectionString:DATABASE_URL});const c=await pool.connect();
 try{await c.query("BEGIN");
 const t=await c.query("INSERT INTO tenants(name,slug,settings) VALUES($1,$2,$3) ON CONFLICT(slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id",[PRIVATE_TENANT_SLUG,PRIVATE_TENANT_SLUG,JSON.stringify({plan:"Premium"})]);
 const u=await c.query("INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id",[PRIVATE_USER_EMAIL.toLowerCase(),PRIVATE_USER_NAME,await bcrypt.hash(PRIVATE_USER_PASSWORD,12)]);
 await c.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,$3)",[t.rows[0].id,u.rows[0].id,PRIVATE_USER_ROLE]);await c.query("COMMIT");console.log("Individual account provisioned; no credentials printed");
 }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();await pool.end();}
}
main().catch(()=>{console.error("Provisioning failed; existing accounts are never overwritten");process.exitCode=1;});
