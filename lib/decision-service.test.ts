import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import type { PrivateSession } from "./private-auth";
const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock("./operational-db", () => ({ tenantTransaction: mocks.transaction }));
import { computeDecisionScenario, decisionScenarioSchema, decisionSchema, saveDecision } from "./decision-service";
const session: PrivateSession = { tenantId: "tenant-A", userId: "user-A", email: "synthetic@example.invalid", name: "Synthetic", role: "operations_supervisor", plan: "Premium" };
const input = { decision: "accept", reason: "Synthetic review evidence", crownSerial: "CROWN-1", filters: { rig: "RIG-1", hole: "HOLE-1" } };
const scenario = { r0: 4, r1: 0.5, elapsed: 2, horizon: 2, threshold: 0.25, ucs: null, ucsSource: "" };
function row() { return { revision: 3, payload: { logicalKey: "shift-1", date: "2026-05-01", rigCode: "RIG-1", holeCode: "HOLE-1", advanceM: 10, drillingHours: 5, crowns: [{ key: "crown-1", serial: "CROWN-1", date: "2026-05-01", rigCode: "RIG-1", holeCode: "HOLE-1", source: { fileSha256: "synthetic-hash", row: 26 } }] } }; }
beforeEach(() => {
  mocks.query.mockReset(); mocks.transaction.mockReset();
  mocks.transaction.mockImplementation(async (_tenant: string, work: (client: PoolClient) => Promise<unknown>) => work({ query: mocks.query } as unknown as PoolClient));
});
describe("atomic decision persistence", () => {
  it("locks evidence and saves server-generated snapshot in one transaction", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [row()] }).mockResolvedValueOnce({ rows: [{ id: "decision-id", created_at: "date" }] });
    expect(await saveDecision(session, { ...input, scenario })).toEqual({ id: "decision-id", created_at: "date" });
    expect(mocks.transaction).toHaveBeenCalledTimes(1); expect(mocks.transaction).toHaveBeenCalledWith("tenant-A", expect.any(Function));
    expect(mocks.query.mock.calls[0][0]).toContain("pg_advisory_xact_lock"); expect(mocks.query.mock.calls[1][0]).toContain("FOR SHARE");
    const [tenant, actor, raw] = mocks.query.mock.calls[2][1]; expect(tenant).toBe("tenant-A"); expect(actor).toBe("user-A");
    const payload = JSON.parse(raw); expect(payload.evidence).toEqual([{ key: "shift-1", revision: 3 }]);
    expect(payload.crownEvidence[0].sourceHash).toBe("synthetic-hash"); expect(payload.summary.ropMPerHour).toBe(2);
    expect(payload.scenario.coefficients.betaPerHour).toBeCloseTo(1.0397207708399179, 14); expect(payload.scenario.coefficients.alphaPerMpaHour).toBeNull(); expect(payload.scenario.modelState).toBe("NOT_VALIDATED");
  });
  it.each(["client", "driller", "control"] as const)("denies %s server-side before touching DB", async role => {
    await expect(saveDecision({ ...session, role }, input)).rejects.toThrow("DECISION_DENIED"); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("denies demo writes and basic-plan access", async () => {
    await expect(saveDecision({ ...session, demo: true }, input)).rejects.toThrow("DECISION_DENIED");
    await expect(saveDecision({ ...session, plan: "Básico" }, input)).rejects.toThrow("DECISION_DENIED");
  });
  it("rejects crowns outside the selected hole or date", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [row()] });
    await expect(saveDecision(session, { ...input, filters: { hole: "HOLE-OTHER" } })).rejects.toThrow("CROWN_OUTSIDE_CONTEXT");
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });
  it("does not accept client-computed evidence or coefficients", async () => {
    await expect(saveDecision(session, { ...input, evidence: [], modelState: "VALIDATED" })).rejects.toThrow();
    expect(decisionScenarioSchema.safeParse({ ...scenario, beta: 0 }).success).toBe(false);
  });
  it("propagates failed insert so transaction rolls back", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [row()] }).mockRejectedValueOnce(new Error("DB_INSERT_FAILED"));
    await expect(saveDecision(session, input)).rejects.toThrow("DB_INSERT_FAILED");
  });
});
describe("stored hypothetical scenario", () => {
  it("allows missing UCS without inventing alpha", () => { const value = computeDecisionScenario(scenario); expect(value.coefficients.alphaPerMpaHour).toBeNull(); expect(value.coefficients.alphaStatus).toBe("UCS_MISSING"); });
  it("requires independent source declaration for alpha", () => {
    expect(computeDecisionScenario({ ...scenario, ucs: 200 }).coefficients.alphaPerMpaHour).toBeNull();
    const result = computeDecisionScenario({ ...scenario, ucs: 200, ucsSource: "Synthetic laboratory example" });
    expect(result.coefficients.alphaPerMpaHour).toBeCloseTo(0.005198603854199589, 15);
    expect(result.ucsEvidence).toBe("USER_DECLARED_INDEPENDENT_SOURCE_NOT_VERIFIED");
  });
  it("preserves improvement and does not extrapolate it as polishing", () => {
    const value = computeDecisionScenario({ ...scenario, r0: 1, r1: 2 });
    expect(value.coefficients.betaPerHour).toBeLessThan(0); expect(value.projection).toBeNull(); expect(value.coefficients.trend).toBe("IMPROVING_NOT_POLISHING");
  });
  it.each([{ r0: 0 }, { r1: Infinity }, { elapsed: 0 }, { horizon: 169 }, { threshold: 0 }, { ucs: -1 }])("rejects unsafe scenario %s", patch => { expect(decisionScenarioSchema.safeParse({ ...scenario, ...patch }).success).toBe(false); });
  it("rejects impossible dates and inverted period", () => {
    expect(decisionSchema.safeParse({ ...input, filters: { from: "2026-02-30" } }).success).toBe(false);
    expect(decisionSchema.safeParse({ ...input, filters: { from: "2026-05-02", to: "2026-05-01" } }).success).toBe(false);
  });
});
