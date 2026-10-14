export function safeDivide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export function calculateRop(metres: number, effectiveHours: number): number {
  return safeDivide(metres, effectiveHours);
}

export function calculateUtilization(effectiveHours: number, shiftHours = 12): number {
  return safeDivide(effectiveHours, shiftHours) * 100;
}

export function calculateMseMpa(input: { wobKn?: number; torqueNm?: number; rpm?: number; ropMetresPerHour?: number; holeDiameterMm?: number; }) {
  const diameterMetres = Math.max(0, input.holeDiameterMm ?? 0) / 1_000;
  const area = Math.PI * diameterMetres ** 2 / 4;
  const ropMetresPerSecond = Math.max(0, input.ropMetresPerHour ?? 0) / 3_600;
  if (!area || !ropMetresPerSecond) return 0;
  const axialPressurePa = Math.max(0, input.wobKn ?? 0) * 1_000 / area;
  const rotationalPowerWatts = 2 * Math.PI * Math.max(0, input.rpm ?? 0) / 60 * Math.max(0, input.torqueNm ?? 0);
  const volumetricRate = area * ropMetresPerSecond;
  return (axialPressurePa + rotationalPowerWatts / volumetricRate) / 1_000_000;
}

export function calculateRunCosts(input: { entryDepth: number; exitDepth: number; purchaseCost: number; drillingHours: number; rigHourlyCost: number; consumablesCost: number; }) {
  const metres = Math.max(0, input.exitDepth - input.entryDepth);
  const rigCost = input.drillingHours * input.rigHourlyCost;
  return {
    metres,
    bitCostPerMetre: safeDivide(input.purchaseCost, metres),
    rigCost,
    rigCostPerMetre: safeDivide(rigCost, metres),
    consumablesCostPerMetre: safeDivide(input.consumablesCost, metres),
    totalCostPerMetre: safeDivide(input.purchaseCost + rigCost + input.consumablesCost, metres),
  };
}

export function estimateCompletion(input: { currentDepth: number; targetDepth: number; recentRop: number; utilizationPct: number; from?: Date }) {
  const remaining = Math.max(0, input.targetDepth - input.currentDepth);
  const effectiveHours = safeDivide(remaining, input.recentRop);
  const calendarHours = safeDivide(effectiveHours, input.utilizationPct / 100);
  const eta = new Date((input.from ?? new Date("2026-08-07T12:00:00-05:00")).getTime() + calendarHours * 3_600_000);
  return { remaining, effectiveHours, calendarHours, eta };
}

export function forecastAdvance24h(rows: Array<{ metres: number; utilization?: number }>) {
  const recent = rows.slice(-7).filter((row) => Number.isFinite(row.metres) && row.metres >= 0);
  if (!recent.length) return { central: 0, low: 0, high: 0, confidence: "low" as const, observations: 0, trendPerDay: 0 };
  const weights = recent.map((_, index) => index + 1);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const weightedMean = recent.reduce((sum, row, index) => sum + row.metres * weights[index], 0) / totalWeight;
  const xMean = (recent.length - 1) / 2;
  const yMean = recent.reduce((sum, row) => sum + row.metres, 0) / recent.length;
  const numerator = recent.reduce((sum, row, index) => sum + (index - xMean) * (row.metres - yMean), 0);
  const denominator = recent.reduce((sum, _, index) => sum + (index - xMean) ** 2, 0);
  const trendPerDay = denominator ? numerator / denominator : 0;
  const trendAdjustment = Math.max(-weightedMean * 0.2, Math.min(weightedMean * 0.2, trendPerDay * 0.6));
  const central = Math.max(0, weightedMean + trendAdjustment);
  const residuals = recent.map((row, index) => Math.abs(row.metres - (yMean + trendPerDay * (index - xMean))));
  const meanAbsoluteError = residuals.reduce((sum, value) => sum + value, 0) / residuals.length;
  const uncertainty = Math.max(central * 0.1, meanAbsoluteError * 1.65);
  const coefficientOfVariation = safeDivide(meanAbsoluteError, central);
  const confidence = recent.length >= 6 && coefficientOfVariation <= 0.15 ? "high" : recent.length >= 4 && coefficientOfVariation <= 0.3 ? "medium" : "low";
  return {
    central,
    low: Math.max(0, central - uncertainty),
    high: central + uncertainty,
    confidence,
    observations: recent.length,
    trendPerDay,
  };
}
