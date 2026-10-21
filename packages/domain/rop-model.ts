/** V2 empirical ROP hypothesis. Effective drilling hours, never calendar hours.
 * These functions do not estimate physical wear or prescribe machine settings. */
export const ROP_MODEL_VERSION = "rop-exponential-v2.1";
export const MAX_SCENARIO_HOURS = 168;
export type Trend = "DECAY" | "STABLE" | "IMPROVING_NOT_POLISHING";
export type IndependentUcs = { valueMpa: number; source: string; independentlyMeasured: true };
function finite(name: string, value: number, positive = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || (positive ? value <= 0 : value < 0)) throw new Error(`${name}: rango inválido`);
  return value;
}
function result(value: number) {
  if (!Number.isFinite(value)) throw new Error("Resultado fuera del rango numérico");
  return value;
}
function alphaFor(beta: number, ucs?: IndependentUcs | null) {
  if (!ucs) return { alphaPerMpaHour: null, alphaStatus: "UCS_MISSING" as const };
  finite("UCS MPa", ucs.valueMpa, true);
  if (ucs.independentlyMeasured !== true || !ucs.source.trim()) return { alphaPerMpaHour: null, alphaStatus: "UCS_UNCONFIRMED" as const };
  return beta < 0 ? { alphaPerMpaHour: null, alphaStatus: "IMPROVING_NOT_POLISHING" as const } : { alphaPerMpaHour: result(beta / ucs.valueMpa), alphaStatus: "AVAILABLE" as const };
}
export function twoPointDecay(rop0: number, rop1: number, elapsedHours: number, ucs?: IndependentUcs | null) {
  finite("ROP inicial", rop0, true); finite("ROP final", rop1, true); finite("Horas efectivas", elapsedHours, true);
  const betaPerHour = result(-(Math.log(rop1) - Math.log(rop0)) / elapsedHours);
  const trend: Trend = betaPerHour > 0 ? "DECAY" : betaPerHour === 0 ? "STABLE" : "IMPROVING_NOT_POLISHING";
  return { betaPerHour, ...alphaFor(betaPerHour, ucs), trend, validation: "TWO_POINT_SCENARIO_NOT_FIELD_VALIDATED" as const, version: ROP_MODEL_VERSION };
}
/** Same V2 algebra, but a hypothetical UCS must never claim independent measurement. */
export function scenarioCoefficients(rop0: number, rop1: number, elapsedHours: number, ucs: number | null, source: string, kind: "hypothetical" | "independent") {
  const estimate = twoPointDecay(rop0, rop1, elapsedHours,
    kind === "independent" && ucs !== null ? { valueMpa: ucs, source, independentlyMeasured: true } : null);
  if (kind !== "hypothetical" || ucs === null) return estimate;
  finite("UCS hipotética MPa", ucs, true);
  if (estimate.betaPerHour < 0) return estimate;
  return { ...estimate, alphaPerMpaHour: result(estimate.betaPerHour / ucs), alphaStatus: "HYPOTHETICAL_UCS" as const };
}
export function predictRop(ropNow: number, beta: number, horizonHours: number) {
  finite("ROP", ropNow, true); finite("Beta", beta); finite("Horas", horizonHours);
  return result(ropNow * Math.exp(-beta * horizonHours));
}
export function advanceMetres(ropNow: number, beta: number, horizonHours: number) {
  finite("ROP", ropNow, true); finite("Beta", beta); finite("Horas", horizonHours);
  const x = result(beta * horizonHours);
  return result(x === 0 ? ropNow * horizonHours : ropNow * (-Math.expm1(-x)) / beta);
}
export function intervalMetres(ropAtOrigin: number, beta: number, startHours: number, endHours: number) {
  finite("Inicio", startHours); finite("Fin", endHours);
  if (endHours <= startHours) throw new Error("La ventana debe tener duración positiva");
  const rate = predictRop(ropAtOrigin, beta, startHours);
  return rate === 0 ? 0 : advanceMetres(rate, beta, endHours - startHours);
}
export function timeToRopThreshold(ropNow: number, beta: number, threshold: number) {
  finite("ROP", ropNow, true); finite("Beta", beta); finite("Umbral", threshold, true);
  if (ropNow <= threshold) return 0;
  return beta === 0 ? null : result((Math.log(ropNow) - Math.log(threshold)) / beta);
}
export function scenario(input: { ropNow: number; beta: number; horizonHours: number; threshold?: number }) {
  if (input.horizonHours > MAX_SCENARIO_HOURS) throw new Error("Máximo 168 horas efectivas; revisar dominio y supuestos");
  return { state: "SCENARIO" as const, version: ROP_MODEL_VERSION, futureRop: predictRop(input.ropNow, input.beta, input.horizonHours), metres: advanceMetres(input.ropNow, input.beta, input.horizonHours), thresholdHours: input.threshold === undefined ? null : timeToRopThreshold(input.ropNow, input.beta, input.threshold), physicalValidation: "PENDING" as const };
}
export type MseInput = { wobN: number | null; torqueNm: number | null; rpm: number | null; ropMetresPerHour: number | null; outerDiameterM: number | null; coreDiameterM: number | null; unitsConfirmed: boolean; geometryConfirmed: boolean; measurementLocation: "surface" | "downhole" };
export function mseAnnularMpa(input: MseInput) {
  const absent = (reason: string) => ({ value: null, reason, kind: input.measurementLocation === "surface" ? "APPARENT_SURFACE_MSE" : "IDEAL_MSE" });
  if (!input.unitsConfirmed) return absent("UNITS_UNCONFIRMED");
  if (!input.geometryConfirmed) return absent("GEOMETRY_UNCONFIRMED");
  const { wobN: f, torqueNm: t, rpm, ropMetresPerHour: r, outerDiameterM: outer, coreDiameterM: core } = input;
  if ([f, t, rpm, r, outer, core].some(v => v === null)) return absent("MISSING_INPUT");
  if ([f, t, rpm, r, outer, core].some(v => typeof v !== "number" || !Number.isFinite(v) || v < 0)) return absent("INVALID_INPUT");
  if (r === 0) return absent("ZERO_ROP");
  if (!(outer! > core!)) return absent("INVALID_GEOMETRY");
  const area = Math.PI * (outer! ** 2 - core! ** 2) / 4;
  const value = (f! / area + t! * (2 * Math.PI * rpm! / 60) / (area * r! / 3600)) / 1e6;
  return Number.isFinite(value) ? { value, reason: null, kind: input.measurementLocation === "surface" ? "APPARENT_SURFACE_MSE" : "IDEAL_MSE" } : absent("NUMERIC_RANGE");
}
export function weightedRop(rows: Array<{ metres: number; hours: number }>) {
  if (!rows.length) return null;
  let metres = 0, hours = 0;
  for (const row of rows) { metres += finite("Metros", row.metres); hours += finite("Horas", row.hours, true); }
  return result(metres / hours);
}
export function observedHeightLossMm(before: number, after: number) {
  finite("Altura anterior", before); finite("Altura posterior", after);
  if (after > before) throw new Error("Revisar medición e identidad de corona");
  return before - after;
}
export type RopWindow = { id: string; episodeId: string; startHours: number; endHours: number; metres: number; attributable: boolean; regimeConfirmed: boolean };
/** Unweighted least squares on window metres, not endpoints. Last chronological
 * 30% held out; one episode only, no duplicated snapshots or overlapping windows.
 * Even a perfect synthetic fit is never promoted to VALIDATED_LOCAL here. */
export function fitRopWindows(windows: RopWindow[], ucs?: IndependentUcs | null) {
  const pending = (reason: string) => ({ state: "UNAVAILABLE" as const, reason, version: ROP_MODEL_VERSION, validated: false as const });
  if (windows.length < 5) return pending("INSUFFICIENT_EVIDENCE");
  if (windows.some(w => !w.attributable)) return pending("IDENTITY_UNCONFIRMED");
  if (windows.some(w => !w.regimeConfirmed)) return pending("REGIME_UNCONFIRMED");
  if (new Set(windows.map(w => w.episodeId)).size !== 1 || windows.some(w => !w.episodeId)) return pending("MIXED_EPISODES");
  if (new Set(windows.map(w => w.id)).size !== windows.length) return pending("DUPLICATE_OBSERVATIONS");
  const rows = [...windows].sort((a, b) => a.startHours - b.startHours);
  if (rows.some((w, i) => ![w.startHours, w.endHours, w.metres].every(Number.isFinite) || w.startHours < 0 || w.endHours <= w.startHours || w.metres < 0 || (i > 0 && Math.abs(w.startHours - rows[i - 1].endHours) > 1e-8))) return pending("INVALID_TIME_COVERAGE");
  const origin = rows[0].startHours;
  const normalized = rows.map(w => ({ ...w, startHours: w.startHours - origin, endHours: w.endHours - origin }));
  const split = Math.max(3, Math.floor(rows.length * .7));
  const train = normalized.slice(0, split), evaluation = normalized.slice(split);
  if (!train.some(w => w.metres > 0)) return pending("INSUFFICIENT_POSITIVE_ADVANCE");
  // Signed beta preserves increasing trends. Bound exponent to avoid overflow.
  const bound = Math.min(5, 300 / normalized.at(-1)!.endHours);
  const unitMetres = (w: RopWindow, beta: number) => beta === 0 ? w.endHours - w.startHours : Math.exp(-beta * w.startHours) * (-Math.expm1(-beta * (w.endHours - w.startHours))) / beta;
  const fit = (beta: number) => {
    const units = train.map(w => unitMetres(w, beta));
    const r0 = train.reduce((sum, w, i) => sum + w.metres * units[i], 0) / units.reduce((sum, u) => sum + u * u, 0);
    return { beta, r0, sse: train.reduce((sum, w, i) => sum + (w.metres - r0 * units[i]) ** 2, 0) };
  };
  let best = fit(0);
  const step = bound / 100;
  for (let i = -100; i <= 100; i++) { const candidate = fit(i * step); if (candidate.sse < best.sse) best = candidate; }
  let left = Math.max(-bound, best.beta - step), right = Math.min(bound, best.beta + step);
  for (let i = 0; i < 90; i++) {
    const a = left + (right - left) / 3, b = right - (right - left) / 3;
    if (fit(a).sse < fit(b).sse) right = b; else left = a;
  }
  const refined = fit((left + right) / 2);
  if (refined.sse < best.sse) best = refined;
  const baselineRop = weightedRop(train.map(w => ({ metres: w.metres, hours: w.endHours - w.startHours })))!;
  const mae = (predict: (w: RopWindow) => number, meanRop = false) => evaluation.reduce((sum, w) => sum + Math.abs(w.metres - predict(w)) / (meanRop ? w.endHours - w.startHours : 1), 0) / evaluation.length;
  return { state: "EXPLORATORY_FIT" as const, validated: false as const, version: ROP_MODEL_VERSION, reason: "PHYSICAL_VALIDATION_PENDING", betaPerHour: best.beta, ropAtOrigin: best.r0, ...alphaFor(best.beta, ucs), trend: best.beta < 0 ? "IMPROVING_NOT_POLISHING" : best.beta === 0 ? "STABLE" : "DECAY", trainIds: train.map(w => w.id), evaluationIds: evaluation.map(w => w.id), trainSseMetres: best.sse, evaluationMaeMetres: mae(w => best.r0 * unitMetres(w, best.beta)), evaluationMaeRop: mae(w => best.r0 * unitMetres(w, best.beta), true), baselineMaeMetres: mae(w => baselineRop * (w.endHours - w.startHours)), baselineRop, effectiveDomainHours: [origin, rows.at(-1)!.endHours], betaAtSearchBoundary: Math.abs(best.beta) >= bound * .999, method: "WINDOW_METRES_LEAST_SQUARES_CHRONOLOGICAL_HOLDOUT" };
}
