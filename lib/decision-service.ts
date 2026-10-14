import { z } from "zod";
import { canAccessSection } from "./access-control";
import { tenantTransaction } from "./operational-db";
import { summarize } from "./operational-store";
import type { PrivateSession } from "./private-auth";
import type { CrownSnapshot, OperationalShift } from "@/packages/import/types";
import { MAX_SCENARIO_HOURS, ROP_MODEL_VERSION, scenario as projectScenario, twoPointDecay } from "@/packages/domain/rop-model";

const rate = z.number().finite().min(0.000001).max(1000);
export const decisionScenarioSchema = z.object({
  r0: rate, r1: rate, elapsed: z.number().finite().min(0.000001).max(10000),
  horizon: z.number().finite().min(0).max(MAX_SCENARIO_HOURS), threshold: rate,
  ucs: z.number().finite().positive().max(2000).nullable(), ucsSource: z.string().trim().max(500).default(""),
}).strict();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`); return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Invalid calendar date");
export const decisionSchema = z.object({
  decision: z.enum(["accept", "reject", "alternative"]), reason: z.string().trim().min(5).max(1000), crownSerial: z.string().trim().min(1).max(100),
  filters: z.object({ from: z.union([date,z.literal("")]).optional(), to: z.union([date,z.literal("")]).optional(), rig: z.string().trim().max(120).optional(), hole: z.string().trim().max(120).optional() }).strict().refine(filters => !filters.from || !filters.to || filters.from <= filters.to, "Invalid date interval"),
  scenario: decisionScenarioSchema.nullable().optional(),
}).strict();
export type DecisionInput = z.input<typeof decisionSchema>;

export function canRecordDecision(session: PrivateSession): boolean {
  return !session.demo && ["platform_admin", "general_manager", "operations_supervisor"].includes(session.role) && canAccessSection({ ...session, section: "bit-advisor" });
}
export function computeDecisionScenario(input: z.infer<typeof decisionScenarioSchema>) {
  const declaredUcs = input.ucs !== null && input.ucsSource ? { valueMpa: input.ucs, source: input.ucsSource, independentlyMeasured: true as const } : null;
  const coefficients = twoPointDecay(input.r0, input.r1, input.elapsed, declaredUcs);
  return {
    source: "USER_SUPPLIED_HYPOTHETICAL" as const, modelVersion: ROP_MODEL_VERSION, modelState: "NOT_VALIDATED" as const,
    assumptions: input, ucsEvidence: declaredUcs ? "USER_DECLARED_INDEPENDENT_SOURCE_NOT_VERIFIED" : "NO_INDEPENDENT_SOURCE",
    coefficients, projection: coefficients.betaPerHour >= 0 ? projectScenario({ ropNow: input.r1, beta: coefficients.betaPerHour, horizonHours: input.horizon, threshold: input.threshold }) : null,
    limits: "Instantaneous comparable hypothetical rates; not shift averages, calibrated client coefficients, physical wear, or remaining crown life.",
  };
}

/** Snapshot evidence and decision commit share one transaction; imports use the same
 * advisory lock, and FOR SHARE prevents corrections changing selected revisions. */
export async function saveDecision(session: PrivateSession, untrusted: unknown) {
  if (!canRecordDecision(session)) throw new Error("DECISION_DENIED");
  const input = decisionSchema.parse(untrusted);
  const computed = input.scenario ? computeDecisionScenario(input.scenario) : null;
  return tenantTransaction(session.tenantId, async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [session.tenantId]);
    const rows = await client.query<{ payload: OperationalShift & { crowns?: CrownSnapshot[] }; revision: number }>("SELECT payload,revision FROM operational_shifts WHERE tenant_id=$1 ORDER BY logical_key FOR SHARE", [session.tenantId]);
    const f = input.filters;
    const shifts = rows.rows.map(row => ({ ...row.payload, revision: row.revision })).filter(s => (!f.from || s.date >= f.from) && (!f.to || s.date <= f.to) && (!f.rig || s.rigCode === f.rig) && (!f.hole || s.holeCode === f.hole));
    const selected = shifts.flatMap(s => s.crowns ?? []).filter(c => c.serial === input.crownSerial && (!f.hole || c.holeCode === f.hole) && (!f.rig || c.rigCode === f.rig));
    if (!selected.length) throw new Error("CROWN_OUTSIDE_CONTEXT");
    const crowns = [...new Map(selected.map(c => [`${c.date}|${c.key}`, c])).values()];
    const payload = {
      decision: input.decision, reason: input.reason, crownSerial: input.crownSerial, filters: input.filters,
      ruleVersion: "historical-review-v1", modelState: "NOT_VALIDATED", summary: summarize(shifts),
      evidence: shifts.map(s => ({ key: s.logicalKey, revision: s.revision })),
      crownEvidence: crowns.map(c => ({ key: c.key, date: c.date, rigCode: c.rigCode, holeCode: c.holeCode, sourceHash: c.source.fileSha256, row: c.source.row })),
      scenario: computed, actor: session.name, actorId: session.userId,
    };
    const result = await client.query("INSERT INTO operational_decisions(tenant_id,actor_id,payload) VALUES($1,$2,$3) RETURNING id,created_at", [session.tenantId, session.userId, JSON.stringify(payload)]);
    return result.rows[0];
  });
}
