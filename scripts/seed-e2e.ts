/** Public synthetic test credentials; NEVER run against a deployed database. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
const tenants = ["00000000-0000-4000-8000-000000000e21", "00000000-0000-4000-8000-000000000e22"];
const users = [
  { id: "00000000-0000-4000-8000-000000000e35", email: "owner@drillops-e2e.example.invalid", role: "general_manager", tenant: tenants[0] },
  { id: "00000000-0000-4000-8000-000000000e34", email: "reviewer@drillops-e2e.example.invalid", role: "client", tenant: tenants[0] },
  { id: "00000000-0000-4000-8000-000000000e31", email: "supervisor@drillops-e2e.example.invalid", role: "operations_supervisor", tenant: tenants[0] },
  { id: "00000000-0000-4000-8000-000000000e32", email: "client@drillops-e2e.example.invalid", role: "client", tenant: tenants[0] },
  { id: "00000000-0000-4000-8000-000000000e33", email: "other@drillops-e2e.example.invalid", role: "operations_supervisor", tenant: tenants[1] },
];
async function main() {
  const connectionString = process.env.DRILLOPS_TEST_ADMIN_URL ?? "postgresql://drillops_test:local-disposable-only@127.0.0.1:5448/drillops_test";
  const url = new URL(connectionString);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "5448" && url.pathname === "/drillops_test", "Refusing non-disposable DB");
  const pool = new Pool({ connectionString }); const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (!(await client.query("SELECT 1 FROM pg_roles WHERE rolname='drillops_e2e_runtime'")).rowCount) {
      await client.query("CREATE ROLE drillops_e2e_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD 'Synthetic-E2E-Runtime-Only'");
    }
    await client.query("ALTER ROLE drillops_e2e_runtime NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT");
    await client.query("GRANT USAGE ON SCHEMA public TO drillops_e2e_runtime");
    await client.query("GRANT SELECT ON users,tenants,memberships TO drillops_e2e_runtime");
    await client.query("GRANT SELECT,INSERT,UPDATE ON operational_sessions,operational_login_attempts,operational_imports,operational_shifts,operational_revisions,operational_decisions,operational_reports,operational_report_revisions TO drillops_e2e_runtime");
    await client.query("GRANT SELECT,INSERT,UPDATE ON operational_catalog,operational_catalog_revisions TO drillops_e2e_runtime");
    await client.query("GRANT SELECT,INSERT ON operational_inventory_movements,operational_report_attachments,operational_quick_records TO drillops_e2e_runtime");
    for (const tenant of tenants) {
      await client.query("INSERT INTO tenants(id,name,slug,settings) VALUES($1,'Synthetic E2E tenant',$2,$3) ON CONFLICT(id) DO UPDATE SET active=true,settings=EXCLUDED.settings", [tenant, `synthetic-e2e-${tenant}`, JSON.stringify({ plan: "Premium" })]);
      // Reset only these two reserved synthetic tenants on disposable port 5448.
      for (const table of ["operational_quick_records","operational_inventory_movements","operational_report_attachments","operational_catalog_revisions","operational_catalog","operational_report_revisions", "operational_reports", "operational_decisions", "operational_revisions", "operational_shifts", "operational_imports", "operational_sessions"]) await client.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [tenant]);
    }
    const hash = await bcrypt.hash("Synthetic-E2E-Only-2026!", 10);
    for (const user of users) {
      await client.query("INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,'Synthetic E2E User',$3) ON CONFLICT(id) DO UPDATE SET password_hash=EXCLUDED.password_hash", [user.id, user.email, hash]);
      await client.query("DELETE FROM memberships WHERE user_id=$1", [user.id]);
      await client.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,$3)", [user.tenant, user.id, user.role]);
      if (user.email.startsWith("reviewer@")) await client.query(`UPDATE tenants SET settings=jsonb_set(settings,'{operationalReviewMembershipIds}',(SELECT jsonb_build_array(id::text) FROM memberships WHERE user_id=$1)) WHERE id=$2`,[user.id,user.tenant]);
      await client.query("DELETE FROM operational_login_attempts WHERE identity_hash=$1", [createHash("sha256").update(user.email).digest("hex")]);
    }
    await client.query("COMMIT");
    console.log("E2E synthetic accounts prepared in disposable DB5448; no real data or credentials used.");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); await pool.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "E2E seed failed"); process.exitCode = 1; });
