import { readFile,writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { parseOperationalArchive } from "../packages/import/may-2026";
import type { PrivateSession } from "../lib/private-auth";
// Explicit private paths supplied at execution; never put originals or credentials in repository.
async function main(){
 const secretPath=process.env.DRILLOPS_PROVISION_FILE,source=process.env.DRILLOPS_PRIVATE_ARCHIVE;
 if(!secretPath||!source)throw Error("Explicit private paths required");
 const secret=JSON.parse(await readFile(secretPath,"utf8"));
 const base="@127.0.0.1:55448/drillops";
 const admin=new Pool({connectionString:`postgresql://drillops_admin:${encodeURIComponent(secret.admin_password)}${base}`});
 process.env.DATABASE_URL=`postgresql://${secret.runtime_user}:${encodeURIComponent(secret.runtime_password)}${base}`;
 const bytes=await readFile(source);
 if(crypto.createHash("sha256").update(bytes).digest("hex")!=="0d483fd69016c3f3353ff9591662c58c8fd52e3f52da03e5c3104b012f5f1f45")throw Error("Source hash mismatch");
 const parsed=parseOperationalArchive(bytes);
 const c=await admin.connect();let session:PrivateSession;
 try{
  await c.query("BEGIN");
  const tenant=await c.query("INSERT INTO tenants(name,slug,settings) VALUES('Cliente privado mayo','client-may-2026',$1) ON CONFLICT(slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id",[JSON.stringify({plan:"Premium"})]);
  const email="owner@drillops.internal";
  let user=await c.query("SELECT id FROM users WHERE email=$1",[email]);
  if(!user.rowCount){
   secret.owner_password=crypto.randomBytes(24).toString("base64url");secret.owner_email=email;
   // Store before DB commit so a crash cannot leave an inaccessible generated account.
   await writeFile(secretPath,JSON.stringify(secret,null,2),{mode:0o600});
   user=await c.query("INSERT INTO users(email,name,password_hash) VALUES($1,'Jorge', $2) RETURNING id",[email,await bcrypt.hash(secret.owner_password,12)]);
   await c.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'general_manager')",[tenant.rows[0].id,user.rows[0].id]);
  }
  await c.query("COMMIT");
  session={tenantId:tenant.rows[0].id,userId:user.rows[0].id,email,name:"Jorge",role:"general_manager",plan:"Premium"};
 }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();await admin.end();}
 const {commitImport,readOperation}=await import("../lib/operational-store");
 const first=await commitImport(session,parsed);
 const repeat=await commitImport(session,parsed);
 const loaded=await readOperation(session.tenantId);
 if(loaded.shifts.length!==248||Math.abs(loaded.summary.advanceM-2813.25)>1e-8||!repeat.duplicate)throw Error("Reconciliation failed");
 console.log(JSON.stringify({environment:"private-staging",importId:first.id,reimportDuplicate:repeat.duplicate,summary:loaded.summary,crownSnapshots:loaded.crowns.length}));
 const {operationalPool}=await import("../lib/operational-db");await operationalPool().end();
}
main().catch(()=>{console.error("Private intake failed; inspect scoped diagnostics without exposing credentials");process.exitCode=1;});
