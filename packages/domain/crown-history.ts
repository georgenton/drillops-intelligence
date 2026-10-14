import type { CrownSnapshot, OperationalShift } from "@/packages/import/types";

export const CROWN_HISTORY_VERSION = "crown-history-conservative-v1";
export type CrownHistoryRun = {
  id: string; rigCode: string; holeCode: string | null; serial: string | null;
  type: string | null; brand: string | null; startDepthM: number | null; endDepthM: number | null;
  firstObservedDate: string; lastObservedDate: string; snapshotCount: number;
  state: "OPEN_OR_END_UNCONFIRMED" | "END_REPORTED" | "IDENTITY_UNCONFIRMED";
  reportedMetresM: number | null; attributedMetresM: number; attributedHours: number;
  ropMPerHour: number | null; shiftKeys: string[];
  regimeConfirmed: false; reasons: string[];
};
export type CrownShiftAttribution = { shiftKey: string; runId: string | null; status: "CONFIRMED_DEPTH_COVERAGE" | "UNCERTAIN"; reason: string };
export type CrownHistory = { version: string; runs: CrownHistoryRun[]; attributions: CrownShiftAttribution[]; duplicateSnapshots: number; duplicateShifts: number; uncertainShiftCount: number };
const valid = (v: number | null): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const clean = (v: string | null) => v?.trim() || null;
const epsilon = .001;
function identity(snapshot: CrownSnapshot) {
  // A serial alone is not a run: same crown may be removed/reinstalled. Unknown
  // start, serial or hole cannot safely be joined into a history across dates.
  return clean(snapshot.serial) && clean(snapshot.holeCode) && valid(snapshot.startDepthM)
    ? JSON.stringify([snapshot.rigCode, snapshot.holeCode, clean(snapshot.serial), snapshot.startDepthM, clean(snapshot.brand), clean(snapshot.type)])
    : JSON.stringify(["unconfirmed", snapshot.key]);
}
function fingerprint(snapshot: CrownSnapshot) {
  return JSON.stringify([identity(snapshot), snapshot.type, snapshot.brand, snapshot.startDepthM, snapshot.endDepthM, snapshot.observedMetres]);
}

/** Only full depth coverage by exactly one identified run on that report date
 * attributes a shift. Missing end is unknown, never zero or an inferred lifetime.
 * No split of a mixed shift; no use of repeated lifetime snapshots as advances. */
export function reconstructCrownHistory(snapshots: CrownSnapshot[], shifts: OperationalShift[]): CrownHistory {
  const groups = new Map<string, CrownSnapshot[]>();
  const seenSnapshots = new Set<string>();
  let duplicateSnapshots = 0;
  for (const snapshot of snapshots) {
    const id = identity(snapshot), fp = fingerprint(snapshot);
    if (seenSnapshots.has(fp)) duplicateSnapshots++;
    else seenSnapshots.add(fp);
    // Keep dates for evidence lookup, but never sum snapshots as production.
    const group = groups.get(id) ?? [];
    group.push(snapshot); groups.set(id, group);
  }
  const runs: CrownHistoryRun[] = [...groups.entries()].map(([id, group]) => {
    const first = group[0];
    const knownIdentity = Boolean(clean(first.serial) && clean(first.holeCode) && valid(first.startDepthM));
    const dates = group.map(s => s.date).sort();
    const validEnds = group.filter(s => valid(s.startDepthM) && valid(s.endDepthM) && s.endDepthM >= s.startDepthM).map(s => s.endDepthM!);
    const endDepthM = validEnds.length ? Math.max(...validEnds) : null;
    const reported = group.map(s => s.observedMetres).filter(valid);
    const reasons = new Set<string>(["REGIME_UNCONFIRMED", "NO_PHYSICAL_LIFE_OR_WEAR_ESTIMATE"]);
    if (!knownIdentity) reasons.add("IDENTITY_UNCONFIRMED");
    if (group.some(s => valid(s.endDepthM) && valid(s.startDepthM) && s.endDepthM < s.startDepthM)) reasons.add("INVALID_REPORTED_DEPTH_RANGE");
    if (new Set(validEnds).size > 1) reasons.add("MULTIPLE_REPORTED_END_DEPTHS");
    if (endDepthM === null) reasons.add("END_DEPTH_MISSING");
    return { id, rigCode: first.rigCode, holeCode: clean(first.holeCode), serial: clean(first.serial), type: clean(first.type), brand: clean(first.brand), startDepthM: valid(first.startDepthM) ? first.startDepthM : null, endDepthM, firstObservedDate: dates[0], lastObservedDate: dates.at(-1)!, snapshotCount: new Set(group.map(fingerprint)).size, state: !knownIdentity ? "IDENTITY_UNCONFIRMED" : endDepthM === null ? "OPEN_OR_END_UNCONFIRMED" : "END_REPORTED", reportedMetresM: reported.length ? Math.max(...reported) : null, attributedMetresM: 0, attributedHours: 0, ropMPerHour: null, shiftKeys: [], regimeConfirmed: false, reasons: [...reasons] };
  });
  const shiftGroups = new Map<string, OperationalShift[]>();
  for (const shift of shifts) { const group = shiftGroups.get(shift.logicalKey) ?? []; group.push(shift); shiftGroups.set(shift.logicalKey, group); }
  const attributions: CrownShiftAttribution[] = [];
  const ropMetres = new Map<string, number>();
  for (const [shiftKey, versions] of shiftGroups) {
    const shift = versions[0];
    const uncertain = (reason: string) => attributions.push({ shiftKey, runId: null, status: "UNCERTAIN", reason });
    // A corrected version must be resolved by the canonical store, not guessed.
    if (versions.some(v => JSON.stringify([v.startDepthM, v.endDepthM, v.advanceM, v.drillingHours, v.date, v.rigCode, v.holeCode]) !== JSON.stringify([shift.startDepthM, shift.endDepthM, shift.advanceM, shift.drillingHours, shift.date, shift.rigCode, shift.holeCode]))) { uncertain("CONFLICTING_SHIFT_VERSIONS"); continue; }
    if (!shift.holeCode || !valid(shift.startDepthM) || !valid(shift.endDepthM) || !valid(shift.advanceM) || shift.endDepthM < shift.startDepthM || Math.abs(shift.endDepthM - shift.startDepthM - shift.advanceM) > epsilon) { uncertain("SHIFT_DEPTH_UNCONFIRMED"); continue; }
    if (shift.advanceM === 0) { uncertain("ZERO_ADVANCE_NO_DEPTH_ATTRIBUTION"); continue; }
    const matching = runs.filter(run => run.rigCode === shift.rigCode && run.holeCode === shift.holeCode && groups.get(run.id)!.some(s => s.date === shift.date));
    if (matching.some(run => new Set(groups.get(run.id)!.filter(s => s.date === shift.date).map(s => JSON.stringify([s.endDepthM, s.observedMetres]))).size > 1)) { uncertain("CONFLICTING_CROWN_SNAPSHOTS"); continue; }
    const overlapping = matching.filter(run => groups.get(run.id)!.some(s => s.date === shift.date && valid(s.startDepthM) && (!valid(s.endDepthM) || s.endDepthM >= s.startDepthM) && s.startDepthM < shift.endDepthM! - epsilon && (s.endDepthM === null || s.endDepthM > shift.startDepthM! + epsilon)));
    const candidates = overlapping.filter(run => run.state !== "IDENTITY_UNCONFIRMED" && groups.get(run.id)!.some(s => s.date === shift.date && valid(s.startDepthM) && valid(s.endDepthM) && s.startDepthM <= shift.startDepthM! + epsilon && s.endDepthM >= shift.endDepthM! - epsilon));
    if (candidates.length !== 1 || overlapping.length !== 1) { uncertain(overlapping.length > 1 ? "MIXED_OR_AMBIGUOUS_CROWNS" : "CROWN_COVERAGE_UNCONFIRMED"); continue; }
    const run = candidates[0];
    run.attributedMetresM += shift.advanceM;
    run.shiftKeys.push(shiftKey);
    if (valid(shift.drillingHours) && shift.drillingHours > 0) {
      run.attributedHours += shift.drillingHours;
      ropMetres.set(run.id, (ropMetres.get(run.id) ?? 0) + shift.advanceM);
    } else if (!run.reasons.includes("DRILLING_HOURS_MISSING_OR_ZERO")) run.reasons.push("DRILLING_HOURS_MISSING_OR_ZERO");
    attributions.push({ shiftKey, runId: run.id, status: "CONFIRMED_DEPTH_COVERAGE", reason: "ONE_IDENTIFIED_CROWN_COVERS_FULL_SHIFT_DEPTH" });
  }
  for (const run of runs) run.ropMPerHour = run.attributedHours > 0 ? (ropMetres.get(run.id) ?? 0) / run.attributedHours : null;
  return { version: CROWN_HISTORY_VERSION, runs, attributions, duplicateSnapshots, duplicateShifts: shifts.length - shiftGroups.size, uncertainShiftCount: attributions.filter(a => a.status === "UNCERTAIN").length };
}

/** Descriptive historical comparison, NOT a recommendation of stock availability
 * or a causal ranking. Brand/type unknown stays unknown instead of demo catalog. */
export function compareCrownHistory(history: CrownHistory) {
  const groups = new Map<string, CrownHistoryRun[]>();
  for (const run of history.runs) {
    const key = JSON.stringify([run.brand, run.type]);
    const group = groups.get(key) ?? []; group.push(run); groups.set(key, group);
  }
  return [...groups.values()].map(runs => {
    const hours = runs.reduce((sum, r) => sum + r.attributedHours, 0);
    const ropMetres = runs.reduce((sum, r) => sum + (r.ropMPerHour ?? 0) * r.attributedHours, 0);
    return { brand: runs[0].brand, type: runs[0].type, runCount: runs.length, attributedShiftCount: runs.reduce((sum, r) => sum + r.shiftKeys.length, 0), attributedMetresM: runs.reduce((sum, r) => sum + r.attributedMetresM, 0), ropMPerHour: hours > 0 ? ropMetres / hours : null, stock: null, costPerMetre: null, status: "OBSERVED_HISTORY_NOT_CAUSAL_RANKING" as const, explanation: "ROP ponderada sólo de turnos atribuibles con horas válidas. Régimen/geología no confirmados; no implica superioridad, compatibilidad ni disponibilidad comercial." };
  });
}
