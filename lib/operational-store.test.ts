import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import type { OperationalImport, OperationalShift } from "@/packages/import/types";
import type { PrivateSession } from "./private-auth";

const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("./operational-db", () => ({ tenantTransaction: mocks.transaction }));
import { commitImport, correctShift, readOperation, summarize } from "./operational-store";

function shift(patch: Partial<OperationalShift> = {}): OperationalShift {
  return { logicalKey: "synthetic-day", date: "2026-05-01", rigCode: "RIG-TEST-001", holeCode: "HOLE-TEST-1", projectCode: "SYNTHETIC", shiftType: "day", granularity: "shift", startDepthM: 0, endDepthM: 10, advanceM: 10, drillingHours: 5, totalHours: 12, activities: [], parameters: { rpm: null, torque: null, torqueUnit: null, pulldownPsi: null, holdbackPsi: null }, source: { file: "synthetic.xlsx", fileSha256: "synthetic", sheet: "RIG-TEST-001", cells: {} }, warnings: [], ...patch };
}
const session: PrivateSession = { userId: "user-A", tenantId: "tenant-A", email: "synthetic@example.invalid", name: "Synthetic", role: "operations_supervisor", plan: "Premium" };
const batch = (): OperationalImport => ({ adapterVersion: "synthetic-v1", archiveSha256: "synthetic-sha", shifts: [shift()], crownSnapshots: [], issues: [], summary: { workbooks: 1, operationalSheets: 1, rigs: 1, holes: 1, shiftPositions: 1, positiveAdvances: 1, advanceM: 10, drillingHoursWithAdvance: 5, ropMPerHour: 2, byRig: {} } });
beforeEach(() => {
  mocks.query.mockReset(); mocks.transaction.mockReset();
  mocks.query.mockResolvedValue({rows:[{present:false}]});
  mocks.transaction.mockImplementation(async (_tenant: string, work: (client: PoolClient) => Promise<unknown>) => work({ query: mocks.query } as unknown as PoolClient));
});
describe("operational summary coverage", () => {
  it("does not mix unmatched metres and hours into ROP", () => {
    const result = summarize([shift(), shift({ advanceM: 100, drillingHours: null }), shift({ advanceM: null, drillingHours: 20 })]);
    expect(result.advanceM).toBe(110); expect(result.drillingHours).toBe(25);
    expect(result.ropMPerHour).toBe(2); expect(result.ropCoverage).toBe(1);
    expect(result.missingAdvance).toBe(1); expect(result.missingHours).toBe(1);
  });
  it("preserves true zero-advance hours in paired denominator", () => {
    const result = summarize([shift(), shift({ advanceM: 0, drillingHours: 5 })]);
    expect(result.ropMPerHour).toBe(1); expect(result.ropCoverage).toBe(2); expect(result.shiftCount).toBe(2);
  });
  it("empty/missing denominators produce unavailable ROP, not zero", () => {
    expect(summarize([]).ropMPerHour).toBeNull();
    expect(summarize([shift({ drillingHours: null })]).ropMPerHour).toBeNull();
    expect(summarize([shift({ advanceM: 0, drillingHours: 0 })]).ropMPerHour).toBeNull();
    expect(summarize([shift({ advanceM: 0, drillingHours: 5 })]).ropMPerHour).toBe(0);
  });
  it("groups dates chronologically and excludes empty hole identities", () => {
    const result = summarize([shift({ date: "2026-05-02", holeCode: null }), shift(), shift({ advanceM: 3 })]);
    expect(result.byDay).toEqual([{ date: "2026-05-01", metres: 13, hours: 10 }, { date: "2026-05-02", metres: 10, hours: 5 }]);
    expect(result.holes).toEqual(["HOLE-TEST-1"]);
  });
});
describe("readOperation context", () => {
  it("applies inclusive date + exact rig/hole filters before summaries", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [shift({ date: "2026-04-30" }), shift({ date: "2026-05-01" }), shift({ date: "2026-05-02" }), shift({ date: "2026-05-03" }), shift({ date: "2026-05-01", rigCode: "RIG-OTHER" }), shift({ date: "2026-05-01", holeCode: "HOLE-OTHER" })].map(payload => ({ payload, revision: 1 })) }).mockResolvedValueOnce({ rows: [] });
    const result = await readOperation("tenant-A", { from: "2026-05-01", to: "2026-05-02", rig: "RIG-TEST-001", hole: "HOLE-TEST-1" });
    expect(result.shifts).toHaveLength(2); expect(result.summary.advanceM).toBe(20);
    expect(result.source).toBe("database"); expect(result.availableRigs).toContain("RIG-OTHER");
    expect(mocks.transaction).toHaveBeenCalledWith("tenant-A", expect.any(Function));
    expect(mocks.query.mock.calls[0][1]).toEqual(["tenant-A"]);
  });
  it("filters report-grain observations by the same inclusive operational context",async()=>{
    const reports=[{date:"2026-05-01",rigCode:"RIG-1",holeCode:"HOLE-1"},{date:"2026-05-02",rigCode:"RIG-1",holeCode:"HOLE-1"},{date:"2026-05-01",rigCode:"RIG-2",holeCode:"HOLE-1"},{date:"2026-05-01",rigCode:"RIG-1",holeCode:"HOLE-2"}];
    mocks.query.mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{present:true}]}).mockResolvedValueOnce({rows:reports.map(payload=>({payload}))});
    const result=await readOperation("tenant-A",{from:"2026-05-01",to:"2026-05-01",rig:"RIG-1",hole:"HOLE-1"});
    expect(result.reports).toEqual([reports[0]]);
    expect(mocks.query.mock.calls[3][1]).toEqual(["tenant-A"]);
  });
  it("scopes decisions to requested context", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: "matching", payload: { filters: { rig: "RIG-1" } } }, { id: "other", payload: { filters: { rig: "RIG-2" } } }, { id: "unscoped", payload: {} }] });
    expect((await readOperation("tenant-A", { rig: "RIG-1" })).decisions.map(d => d.id)).toEqual(["matching"]);
  });
  it("propagates DB failures instead of returning fixtures", async () => {
    mocks.query.mockRejectedValue(new Error("DATABASE_DOWN"));
    await expect(readOperation("tenant-A")).rejects.toThrow("DATABASE_DOWN");
  });
});
describe("import and correction protection", () => {
  it("validation failures never enter DB transaction", async () => {
    await expect(commitImport(session, { ...batch(), issues: [{ file: "synthetic.xlsx", sheet: "RIG", cell: "S6", code: "DATE", severity: "error" }] })).rejects.toThrow("IMPORT_VALIDATION_FAILED");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("exact archive reimport returns original job without mutating corrected shift", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: "existing", result: { inserted: 1 } }] });
    expect(await commitImport(session, batch())).toEqual({ id: "existing", result: { inserted: 1 }, duplicate: true });
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });
  it("new archive cannot overwrite manually corrected shift", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: "job" }] }).mockResolvedValueOnce({ rows: [{ payload: shift({ warnings: ["MANUAL_CORRECTION: reviewed"] }) }] });
    await expect(commitImport(session, batch())).rejects.toThrow("MANUAL_CORRECTION_CONFLICT");
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).startsWith("INSERT INTO operational_revisions"))).toBe(false);
    // Real rollback of the job is exercised against PostgreSQL in the integration script.
  });
  it("stale/manual correction cannot mutate record", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ payload: shift(), revision: 3 }] });
    await expect(correctShift(session, { logicalKey: "synthetic-day", revision: 2, advanceM: 9, drillingHours: 5, reason: "Synthetic" })).rejects.toThrow("REVISION_CONFLICT");
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
});
