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
