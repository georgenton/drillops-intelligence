/** Disposable PostgreSQL integration only. Never loads .env or touches dev port 5447. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { OperationalImport, OperationalShift } from "../packages/import/types";
import type { PrivateSession } from "../lib/private-auth";

async function main() {
  const adminUrl = process.env.DRILLOPS_TEST_ADMIN_URL ?? "postgresql://drillops_test:local-disposable-only@127.0.0.1:5448/drillops_test";
  const url = new URL(adminUrl);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "5448" && url.pathname === "/drillops_test", "Refusing non-disposable database target");
  const admin = new Pool({ connectionString: adminUrl, max: 1 });
  const role = `drillops_it_${randomBytes(6).toString("hex")}`, password = randomBytes(24).toString("hex");
  let runtime: ReturnType<typeof import("../lib/operational-db").operationalPool> | undefined;
  let checks = 0;
  const check = async (label: string, fn: () => Promise<void>) => { await fn(); checks++; console.log(`PASS ${label}`); };
  try {
    await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '${password}'`);
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await admin.query(`GRANT SELECT,INSERT,UPDATE ON operational_imports,operational_shifts,operational_revisions,operational_decisions,operational_reports,operational_report_revisions TO ${role}`);
    url.username = role; url.password = password; process.env.DATABASE_URL = url.toString(); process.env.DRILLOPS_ENV = "staging";
    const { operationalPool, tenantTransaction } = await import("../lib/operational-db");
    const { commitImport, correctShift, readOperation } = await import("../lib/operational-store");
    runtime = operationalPool();
    const tenantA = randomUUID(), tenantB = randomUUID(), userA = randomUUID(), userB = randomUUID();
    for (const [tenant, user] of [[tenantA, userA], [tenantB, userB]]) {
      await admin.query("INSERT INTO tenants(id,name,slug) VALUES($1,'Synthetic integration tenant',$2)", [tenant, `test-${tenant}`]);
      await admin.query("INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,'Synthetic user','disabled-test-login')", [user, `${user}@example.invalid`]);
      await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'operations_supervisor')", [tenant, user]);
    }
    const session: PrivateSession = { tenantId: tenantA, userId: userA, name: "Synthetic supervisor", email: "test@example.invalid", role: "operations_supervisor", plan: "Premium" };
    const shift: OperationalShift = { logicalKey: "synthetic-day-1", date: "2026-05-01", rigCode: "RIG-SYNTHETIC-001", holeCode: "SYNTHETIC-HOLE", projectCode: "SYNTHETIC", shiftType: "day", granularity: "shift", startDepthM: 0, endDepthM: 10, advanceM: 10, drillingHours: 5, totalHours: 12, activities: [{ label: "PERFORACIÓN", hours: 5, cell: "C28" }], parameters: { rpm: null, torque: null, torqueUnit: null, pulldownPsi: null, holdbackPsi: null }, source: { file: "synthetic.xlsx", fileSha256: "synthetic-v1", sheet: "RIG-SYNTHETIC-001", cells: {} }, warnings: [] };
    const batch: OperationalImport = { adapterVersion: "integration-synthetic-v1", archiveSha256: "synthetic-v1", shifts: [shift], crownSnapshots: [], issues: [], summary: { workbooks: 1, operationalSheets: 1, rigs: 1, holes: 1, shiftPositions: 1, positiveAdvances: 1, advanceM: 10, drillingHoursWithAdvance: 5, ropMPerHour: 2, byRig: { "RIG-SYNTHETIC-001": 10 } } };

    batch.operationalReports=[{key:"synthetic-report",date:shift.date,rigCode:shift.rigCode,holeCode:shift.holeCode,source:{file:"synthetic.xlsx",fileSha256:"synthetic-v1",sheet:shift.rigCode},survey:[],consumptions:[],materials:[],equipmentHours:[],fluidParameters:[]}];
    await check("runtime is non-owner, non-superuser, NOBYPASSRLS", async () => {
      const roles = await runtime!.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user");
      assert.equal(roles.rows[0].rolsuper, false); assert.equal(roles.rows[0].rolbypassrls, false);
      const policies = await runtime!.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner)=current_user AS owner FROM pg_class WHERE relname='operational_shifts'");
      assert.deepEqual(policies.rows[0], { relrowsecurity: true, relforcerowsecurity: true, owner: false });
    });
    await check("initial import persists and reloads", async () => {
      const imported = await commitImport(session, batch); assert.equal(imported.duplicate, false);
      const state = await readOperation(tenantA); assert.equal(state.shifts.length, 1); assert.equal(state.summary.advanceM, 10); assert.equal(state.summary.ropMPerHour, 2);
    });
    await check("identical import is idempotent", async () => {
      assert.equal((await commitImport(session, batch)).duplicate, true);
      assert.equal((await readOperation(tenantA)).shifts[0].revision, 1);
    });
    await check("expanded reports persist with enforced tenant scope and no empty revisions",async()=>{
      assert.equal((await readOperation(tenantA)).reports.length,1);
      const foreign=await tenantTransaction(tenantB,c=>c.query("SELECT * FROM operational_reports"));assert.equal(foreign.rowCount,0);
      await assert.rejects(tenantTransaction(tenantB,c=>c.query("INSERT INTO operational_reports(tenant_id,logical_key,payload,adapter_version) VALUES($1,'forbidden','{}','synthetic')",[tenantA])),error=>(error as {code:string}).code==="42501");
      const {writeOperationalReports}=await import("../lib/operational-report-store");
      assert.equal(await tenantTransaction(tenantA,c=>writeOperationalReports(c,tenantA,batch.operationalReports!,batch.adapterVersion)),0);
      const version=await tenantTransaction(tenantA,c=>c.query("SELECT revision FROM operational_reports WHERE logical_key='synthetic-report'"));assert.equal(version.rows[0].revision,1);
      const history=await tenantTransaction(tenantA,c=>c.query("SELECT * FROM operational_report_revisions"));assert.equal(history.rowCount,1);
      assert.equal((await tenantTransaction(tenantB,c=>c.query("SELECT * FROM operational_report_revisions"))).rowCount,0);
    });
    await check("backfill refuses a report edited after preview and replays without writes",async()=>{
      const {backfillOperationalReports}=await import("../lib/operational-backfill");
      const {writeOperationalReports}=await import("../lib/operational-report-store");
      const preview=await backfillOperationalReports(session,batch);
      await tenantTransaction(tenantA,c=>writeOperationalReports(c,tenantA,[{...batch.operationalReports![0],holeCode:"CHANGED-SYNTHETIC"}],batch.adapterVersion,userA));
      await assert.rejects(backfillOperationalReports(session,batch,preview.digest),/BACKFILL_PLAN_CONFLICT/);
      const reviewed=await backfillOperationalReports(session,batch);
      assert.ok("reportCounts" in reviewed);assert.equal(reviewed.reportCounts.updated,1);
      const applied=await backfillOperationalReports(session,batch,reviewed.digest);
      assert.ok("reportsChanged" in applied);assert.equal(applied.reportsChanged,1);
      const repeatPlan=await backfillOperationalReports(session,batch);
      const repeated=await backfillOperationalReports(session,batch,repeatPlan.digest);
      assert.ok("reportsChanged" in repeated);assert.equal(repeated.reportsChanged,0);assert.equal(repeated.shiftsChanged,0);
    });
    await check("concurrent same archive creates one import", async () => {
      const next = { ...batch, archiveSha256: "synthetic-concurrent" };
      const results = await Promise.all([commitImport(session, next), commitImport(session, next)]);
      assert.equal(results.filter(r => r.duplicate).length, 1);
      assert.equal((await readOperation(tenantA)).shifts[0].revision, 1);
    });
    await check("corrected archive updates same logical shift and revisions", async () => {
      const revised = { ...batch, archiveSha256: "synthetic-v2", shifts: [{ ...shift, advanceM: 11, endDepthM: 11, source: { ...shift.source, fileSha256: "synthetic-v2" } }] };
      await commitImport(session, revised);
      const state = await readOperation(tenantA); assert.equal(state.shifts.length, 1); assert.equal(state.shifts[0].revision, 2); assert.equal(state.summary.advanceM, 11);
      const revisions = await tenantTransaction(tenantA, c => c.query("SELECT previous_payload,next_payload FROM operational_revisions ORDER BY created_at"));
      assert.equal(revisions.rows.length, 2); assert.equal(revisions.rows[1].previous_payload.advanceM, 10); assert.equal(revisions.rows[1].next_payload.advanceM, 11);
    });
    await check("manual correction persists and stale revision rejects", async () => {
      await correctShift(session, { logicalKey: shift.logicalKey, revision: 2, advanceM: 12, drillingHours: 6, reason: "Synthetic verified correction" });
      const state = await readOperation(tenantA); assert.equal(state.shifts[0].revision, 3); assert.equal(state.summary.advanceM, 12); assert.equal(state.summary.ropMPerHour, 2);
      await assert.rejects(correctShift(session, { logicalKey: shift.logicalKey, revision: 2, advanceM: 9, drillingHours: 5, reason: "Stale synthetic correction" }), /REVISION_CONFLICT/);
    });
    await check("archive cannot replace manual correction; job and prior rows roll back", async () => {
      const conflict = { ...batch, archiveSha256: "synthetic-manual-conflict", shifts: [{ ...shift, logicalKey: "insert-before-conflict" }, shift] };
      await assert.rejects(commitImport(session, conflict), /MANUAL_CORRECTION_CONFLICT/);
      const state = await readOperation(tenantA); assert.equal(state.shifts.length, 1); assert.equal(state.shifts[0].revision, 3); assert.equal(state.summary.advanceM, 12);
      const jobs = await tenantTransaction(tenantA, c => c.query("SELECT id FROM operational_imports WHERE source_hash='synthetic-manual-conflict'")); assert.equal(jobs.rows.length, 0);
      assert.equal((await commitImport(session, batch)).duplicate, true);
      assert.equal((await readOperation(tenantA)).summary.advanceM, 12);
    });
    await check("tenant B cannot read A even without WHERE", async () => {
      const rows = await tenantTransaction(tenantB, c => c.query("SELECT * FROM operational_shifts")); assert.equal(rows.rows.length, 0);
      assert.equal((await readOperation(tenantB)).shifts.length, 0);
    });
    await check("tenant B cannot update A", async () => {
      const changed = await tenantTransaction(tenantB, c => c.query("UPDATE operational_shifts SET revision=99 WHERE tenant_id=$1", [tenantA])); assert.equal(changed.rowCount, 0);
      assert.equal((await readOperation(tenantA)).shifts[0].revision, 3);
    });
    await check("tenant B cross-tenant insert rejected by RLS", async () => {
      await assert.rejects(tenantTransaction(tenantB, c => c.query("INSERT INTO operational_shifts(tenant_id,logical_key,payload) VALUES($1,'forbidden',$2)", [tenantA, JSON.stringify(shift)])), error => (error as { code: string }).code === "42501");
    });
    await check("missing tenant context fails closed and pooled context resets", async () => {
      const result = await runtime!.query("SELECT * FROM operational_shifts"); assert.equal(result.rows.length, 0);
      await assert.rejects(runtime!.query("INSERT INTO operational_shifts(tenant_id,logical_key,payload) VALUES($1,'missing-context',$2)", [tenantA, JSON.stringify(shift)]), error => (error as { code: string }).code === "42501");
    });
    await check("decision persists, reloads and remains tenant scoped", async () => {
      const payload = { decision: "accept", reason: "Synthetic review only", crownSerial: "SYNTHETIC-001", ruleVersion: "historical-review-v1", modelState: "NOT_VALIDATED", evidence: [{ key: shift.logicalKey, revision: 3 }] };
      await tenantTransaction(tenantA, c => c.query("INSERT INTO operational_decisions(tenant_id,actor_id,payload) VALUES($1,$2,$3)", [tenantA, userA, JSON.stringify(payload)]));
      const own = await readOperation(tenantA), other = await readOperation(tenantB); assert.deepEqual(own.decisions[0].payload, payload); assert.equal(other.decisions.length, 0);
      await assert.rejects(tenantTransaction(tenantB, c => c.query("INSERT INTO operational_decisions(tenant_id,actor_id,payload) VALUES($1,$2,$3)", [tenantA, userB, JSON.stringify(payload)])), error => (error as { code: string }).code === "42501");
    });
    await check("failed batch rolls back job and all previous rows", async () => {
      const invalid = { ...batch, archiveSha256: "synthetic-rollback", shifts: [{ ...shift, logicalKey: "would-insert" }, { ...shift, logicalKey: null } as unknown as OperationalShift] };
      await assert.rejects(commitImport(session, invalid));
      const state = await readOperation(tenantA); assert.equal(state.shifts.length, 1);
      const jobs = await tenantTransaction(tenantA, c => c.query("SELECT id FROM operational_imports WHERE source_hash='synthetic-rollback'")); assert.equal(jobs.rows.length, 0);
    });
    await check("validation error refuses import before persistence", async () => {
      await assert.rejects(commitImport(session, { ...batch, archiveSha256: "bad-validation", issues: [{ file: "synthetic", sheet: "synthetic", cell: "S6", code: "FILENAME_DATE_MISMATCH", severity: "error" }] }), /IMPORT_VALIDATION_FAILED/);
    });
    console.log(`Operational PostgreSQL integration: ${checks} checks passed; synthetic data only; disposable port 5448.`);
  } finally {
    await runtime?.end();
    await admin.query(`REVOKE ALL ON operational_imports,operational_shifts,operational_revisions,operational_decisions,operational_reports,operational_report_revisions FROM ${role}`).catch(() => undefined);
    await admin.query(`REVOKE ALL ON SCHEMA public FROM ${role}`).catch(() => undefined);
    await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined);
    await admin.end();
  }
}
main().catch(error => { console.error("Operational integration FAILED:", error instanceof Error ? error.message : "unknown error"); process.exitCode = 1; });
