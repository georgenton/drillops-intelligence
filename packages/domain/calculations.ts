export function safeDivide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export function calculateRop(metres: number, effectiveHours: number): number {
  return safeDivide(metres, effectiveHours);
}

export function calculateUtilization(effectiveHours: number, shiftHours = 12): number {
  return safeDivide(effectiveHours, shiftHours) * 100;
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
