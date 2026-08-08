import { calculateRop, calculateUtilization, estimateCompletion, safeDivide } from "@/packages/domain/calculations";
import type { Crown, Interval } from "@/packages/domain/types";
import type { BiDataset, DailyPerformance, OperationalSnapshot } from "./types";

const ANALYTICS_NOW = new Date("2026-08-07T12:00:00-05:00");
const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const mean = (values: number[]) => safeDivide(values.reduce((sum, value) => sum + value, 0), values.length);

function dateDaysBefore(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function crownCode(crown: Crown) {
  return crown.id.replace(/^(a-|b-)/, "").toUpperCase();
}

function findCrown(crowns: Crown[], code: string) {
  const normalized = code.toUpperCase();
  return crowns.find((crown) => crownCode(crown) === normalized || crown.matrix.toUpperCase().startsWith(normalized.replace("GT-", "")));
}

function intervalRop(interval: Interval) {
  return calculateRop(interval.endDepth - interval.startDepth, interval.minutes / 60);
}

function countRuns(intervals: Interval[]) {
  return intervals.reduce((runs, interval, index) => runs + (index === 0 || interval.bitCode !== intervals[index - 1]?.bitCode ? 1 : 0), 0);
}

function buildDaily(shifts: BiDataset["shifts"]): DailyPerformance[] {
  const grouped = new Map<string, { metres: number; effectiveHours: number; totalHours: number; nptHours: number }>();
  for (const shift of shifts) {
    const item = grouped.get(shift.date) ?? { metres: 0, effectiveHours: 0, totalHours: 0, nptHours: 0 };
    item.metres += Math.max(0, shift.depthEnd - shift.depthStart);
    item.effectiveHours += shift.effectiveHours;
    item.totalHours += shift.totalHours;
    item.nptHours += Object.values(shift.npt).reduce((sum, hours) => sum + hours, 0);
    grouped.set(shift.date, item);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, item]) => ({
    date,
    metres: round(item.metres, 1),
    effectiveHours: round(item.effectiveHours, 1),
    totalHours: round(item.totalHours, 1),
    rop: round(calculateRop(item.metres, item.effectiveHours), 2),
    utilization: round(calculateUtilization(item.effectiveHours, item.totalHours), 1),
    nptHours: round(item.nptHours, 1),
  }));
}

export function buildOperationalSnapshot(dataset: BiDataset, drillholeId?: string, periodDays = 7): OperationalSnapshot {
  const hole = dataset.drillholes.find((item) => item.id === drillholeId)
    ?? dataset.drillholes.find((item) => item.status === "drilling")
    ?? dataset.drillholes[0]
    ?? null;
  const allHoleShifts = dataset.shifts.filter((shift) => !hole || shift.drillholeId === hole.id);
  const periodEnd = allHoleShifts.map((shift) => shift.date).sort().at(-1) ?? ANALYTICS_NOW.toISOString().slice(0, 10);
  const periodStart = dateDaysBefore(periodEnd, periodDays - 1);
  const periodShifts = allHoleShifts.filter((shift) => shift.date >= periodStart && shift.date <= periodEnd);
  const daily = buildDaily(periodShifts);
  const metres = periodShifts.reduce((sum, shift) => sum + Math.max(0, shift.depthEnd - shift.depthStart), 0);
  const effectiveHours = periodShifts.reduce((sum, shift) => sum + shift.effectiveHours, 0);
  const totalHours = periodShifts.reduce((sum, shift) => sum + shift.totalHours, 0);
  const rop = calculateRop(metres, effectiveHours);
  const utilization = calculateUtilization(effectiveHours, totalHours);

  const nptTotals = new Map<string, number>();
  for (const shift of periodShifts) {
    for (const [cause, hours] of Object.entries(shift.npt)) nptTotals.set(cause, (nptTotals.get(cause) ?? 0) + hours);
  }
  const nptTotal = [...nptTotals.values()].reduce((sum, hours) => sum + hours, 0);
  const npt = [...nptTotals.entries()]
    .map(([cause, hours]) => ({ cause, hours: round(hours, 1), sharePct: round(safeDivide(hours, nptTotal) * 100, 1) }))
    .sort((a, b) => b.hours - a.hours);

  const holeIntervals = dataset.intervals.filter((interval) => !hole || interval.drillholeId === hole.id).sort((a, b) => a.startDepth - b.startDepth);
  const anomalyIntervals = holeIntervals.filter((interval) => interval.vibration === "high" && interval.stability === "unstable");
  const anomalyFirstIndex = anomalyIntervals.length ? holeIntervals.findIndex((interval) => interval.id === anomalyIntervals[0]?.id) : -1;
  const previousIntervals = anomalyFirstIndex >= 0 ? holeIntervals.slice(Math.max(0, anomalyFirstIndex - 5), anomalyFirstIndex) : [];
  const anomalyRop = mean(anomalyIntervals.map(intervalRop));
  const previousRop = mean(previousIntervals.map(intervalRop));
  const anomalyPressure = mean(anomalyIntervals.flatMap((interval) => interval.pressure == null ? [] : [interval.pressure]));
  const previousPressure = mean(previousIntervals.flatMap((interval) => interval.pressure == null ? [] : [interval.pressure]));
  const anomaly = anomalyIntervals.length ? {
    from: anomalyIntervals[0].startDepth,
    to: anomalyIntervals.at(-1)?.endDepth ?? anomalyIntervals[0].endDepth,
    ropChangePct: round(safeDivide(anomalyRop - previousRop, previousRop) * 100, 1),
    pressureChangePct: round(safeDivide(anomalyPressure - previousPressure, previousPressure) * 100, 1),
    hardness: round(mean(anomalyIntervals.map((interval) => interval.hardness)), 1),
    fracturing: anomalyIntervals.filter((interval) => interval.fracturing === "high").length >= anomalyIntervals.length / 2 ? "alta" : "mixta",
  } : null;

  const lastInterval = holeIntervals.at(-1);
  const activeCode = lastInterval?.bitCode ?? "";
  const activeRunIntervals: Interval[] = [];
  for (let index = holeIntervals.length - 1; index >= 0; index -= 1) {
    if (holeIntervals[index]?.bitCode !== activeCode) break;
    activeRunIntervals.unshift(holeIntervals[index]);
  }
  const activeCatalog = findCrown(dataset.crowns, activeCode);
  const runMetres = activeRunIntervals.reduce((sum, interval) => sum + interval.endDepth - interval.startDepth, 0);
  const activeCrown = activeCatalog && activeCode ? {
    code: activeCode,
    product: activeCatalog.product,
    runMetres: round(runMetres, 1),
    historicalLife: activeCatalog.historicalLife,
    lifeUsedPct: round(safeDivide(runMetres, activeCatalog.historicalLife) * 100, 1),
    historicalRop: activeCatalog.historicalRop,
    historicalCost: activeCatalog.historicalCost,
    available: Math.max(0, activeCatalog.stock - activeCatalog.reserved),
  } : null;

  const rig = dataset.rigs.find((item) => item.id === hole?.rigId);
  const rigCostPerMetre = safeDivide(effectiveHours * (rig?.hourlyCost ?? 0), metres);
  const operationalCostPerMetre = rigCostPerMetre + (activeCrown?.historicalCost ?? 0);
  const remaining = Math.max(0, (hole?.targetDepth ?? 0) - (hole?.currentDepth ?? 0));
  const etaCalculation = hole && rop > 0 && utilization > 0 ? estimateCompletion({
    currentDepth: hole.currentDepth,
    targetDepth: hole.targetDepth,
    recentRop: rop,
    utilizationPct: utilization,
    from: ANALYTICS_NOW,
  }) : null;
  const etaConfidence = daily.length >= 5 && Math.min(...daily.map((item) => item.utilization)) >= 50 ? "medium" as const : "low" as const;
  const lowHardnessRop = mean(holeIntervals.filter((interval) => interval.hardness < 4).map(intervalRop));
  const highHardnessRop = mean(holeIntervals.filter((interval) => interval.hardness >= 4).map(intervalRop));
  const hardnessRopChangePct = round(safeDivide(highHardnessRop - lowHardnessRop, lowHardnessRop) * 100, 1);

  const alerts: OperationalSnapshot["alerts"] = [];
  if (anomaly) alerts.push({
    id: "rop-anomaly",
    severity: "critical",
    title: "Caída sostenida de ROP",
    detail: `${Math.abs(anomaly.ropChangePct).toFixed(1)}% frente a los 5 intervalos previos`,
    context: `${anomaly.from}–${anomaly.to} m`,
  });
  if (anomalyIntervals.length) alerts.push({
    id: "unstable-intervals",
    severity: "warning",
    title: "Intervalos inestables detectados",
    detail: `${anomalyIntervals.length} intervalos combinan vibración alta e inestabilidad`,
    context: "Depth Intelligence",
  });
  if (activeCrown && activeCrown.available <= 3) alerts.push({
    id: "inventory-margin",
    severity: "warning",
    title: "Margen de inventario reducido",
    detail: `${activeCrown.code}: ${activeCrown.available} unidades disponibles`,
    context: "Almacén Secoya",
  });

  return {
    tenantId: dataset.tenantId,
    source: dataset.source,
    generatedAt: ANALYTICS_NOW.toISOString(),
    period: { start: periodStart, end: periodEnd, days: periodDays, label: `${periodStart} — ${periodEnd}` },
    hole,
    kpis: {
      metres: round(metres, 1),
      effectiveHours: round(effectiveHours, 1),
      rop: round(rop, 2),
      utilization: round(utilization, 1),
      operationalCostPerMetre: round(operationalCostPerMetre, 1),
      currentDepth: hole?.currentDepth ?? 0,
      targetDepth: hole?.targetDepth ?? 0,
      remaining,
      completionPct: round(safeDivide(hole?.currentDepth ?? 0, hole?.targetDepth ?? 0) * 100, 1),
      advance24h: daily.at(-1)?.metres ?? 0,
    },
    daily,
    npt,
    nptTotal: round(nptTotal, 1),
    eta: etaCalculation ? {
      date: etaCalculation.eta.toISOString(),
      effectiveHours: round(etaCalculation.effectiveHours, 1),
      calendarHours: round(etaCalculation.calendarHours, 1),
      confidence: etaConfidence,
    } : null,
    depth: {
      rangeMetres: round((holeIntervals.at(-1)?.endDepth ?? 0) - (holeIntervals[0]?.startDepth ?? 0), 1),
      weightedRop: round(calculateRop(holeIntervals.reduce((sum, interval) => sum + interval.endDepth - interval.startDepth, 0), holeIntervals.reduce((sum, interval) => sum + interval.minutes / 60, 0)), 2),
      averageRecovery: round(mean(holeIntervals.map((interval) => interval.recovery)), 1),
      anomalyCount: anomalyIntervals.length,
      crownRuns: countRuns(holeIntervals),
    },
    anomaly,
    activeCrown,
    alerts,
    hardnessRopChangePct,
  };
}
