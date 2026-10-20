import { readFile } from "node:fs/promises";
import { Pool } from "pg";
// Run after existing Drizzle migrations, with the migration owner (never runtime superuser).
async function main(){
 const pool=new Pool({connectionString:process.env.MIGRATION_DATABASE_URL??process.env.DATABASE_URL});
 const client=await pool.connect();
 try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(710142026)");
  await client.query("CREATE TABLE IF NOT EXISTS operational_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())");
  if(!(await client.query("SELECT 1 FROM operational_migrations WHERE version='0003'")).rowCount){
   await client.query(await readFile(new URL("../packages/db/migrations/0003_operational.sql",import.meta.url),"utf8"));
   await client.query("INSERT INTO operational_migrations(version) VALUES('0003')");
  }
  if(!(await client.query("SELECT 1 FROM operational_migrations WHERE version='0004'")).rowCount){
   await client.query(await readFile(new URL("../packages/db/migrations/0004_operational_reports.sql",import.meta.url),"utf8"));
   await client.query("INSERT INTO operational_migrations(version) VALUES('0004')");
  }
  if(!(await client.query("SELECT 1 FROM operational_migrations WHERE version='0005'")).rowCount){
   await client.query(await readFile(new URL("../packages/db/migrations/0005_operational_report_revisions.sql",import.meta.url),"utf8"));
   await client.query("INSERT INTO operational_migrations(version) VALUES('0005')");
  }
  if(!(await client.query("SELECT 1 FROM operational_migrations WHERE version='0006'")).rowCount){
   await client.query(await readFile(new URL("../packages/db/migrations/0006_operational_catalog.sql",import.meta.url),"utf8"));
   await client.query("INSERT INTO operational_migrations(version) VALUES('0006')");
  }
  for (const [version, file] of [["0007","0007_operational_inventory_attachments.sql"],["0008","0008_operational_quick_records.sql"]]) {
   if (!(await client.query("SELECT 1 FROM operational_migrations WHERE version=$1", [version])).rowCount) {
    await client.query(await readFile(new URL(`../packages/db/migrations/${file}`,import.meta.url),"utf8"));
    await client.query("INSERT INTO operational_migrations(version) VALUES($1)",[version]);
   }
  }
  await client.query("COMMIT");
  console.log("Operational migrations 0003–0008 applied/verified");
 }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();await pool.end();}
}
main().catch(()=>{console.error("Operational migration failed (inspect DB privately)");process.exitCode=1;});
