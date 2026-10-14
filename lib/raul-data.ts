export const raulMonthlyConsumableCosts = [
  { month: "Dic 2022", cost: 15_571.4096 },
  { month: "Ene 2023", cost: 16_742.0608 },
  { month: "Feb 2023", cost: 7_251.18112 },
  { month: "Mar 2023", cost: 3_622.952 },
];

export const raulMarchRigCosts = [
  { rig: "RIG 1", cost: 375 },
  { rig: "RIG 2", cost: 3_247.952 },
];

export const raulMarchConsumableItems = [
  { item: "Water Control", cost: 1_995 },
  { item: "Cydrill", cost: 561 },
  { item: "Aceite 15W40", cost: 263.424 },
  { item: "Perf Pack HV", cost: 210 },
  { item: "Aceite hidráulico", cost: 150.528 },
  { item: "Goma xántica", cost: 142.56 },
  { item: "Grasa en cartucho", cost: 120 },
  { item: "Otros", cost: 180.44 },
];

export const historicalConsumableWells = [
  { well: "DHA-06", period: "Dic 2022", metres: null, cost: 6_137.45536 },
  { well: "DHA-07", period: "Ene–01 feb 2023", metres: null, cost: 15_709.8048 },
  { well: "DHA-08", period: "02–28 feb 2023", metres: null, cost: 6_835.76192 },
  { well: "DHC-27", period: "Dic 2022–feb 2023", metres: null, cost: 10_850.26944 },
  { well: "DHC-27A", period: "Mar 2023", metres: null, cost: 3_247.952 },
] as const;

export const initialSupplyStock = [
  { item: "Rimas", quantity: 4, unit: "un", minimum: 2 },
  { item: "Goma xántica", quantity: 22, unit: "kg", minimum: 12 },
  { item: "Polímero PAC-R", quantity: 18, unit: "kg", minimum: 10 },
  { item: "Aceite 15W40", quantity: 14, unit: "gal", minimum: 8 },
  { item: "Aceite hidráulico", quantity: 8, unit: "gal", minimum: 6 },
  { item: "Grasa", quantity: 9, unit: "un", minimum: 6 },
];

export const rigOperatingSupplies: Record<string, { dieselLitresPerMetre: number; spareParts: number; criticalParts: string[] }> = {
  "mp-07": { dieselLitresPerMetre: 1.94, spareParts: 18, criticalParts: ["Filtro FP10", "Filtro diésel", "Manguera hidráulica"] },
  "hc-03": { dieselLitresPerMetre: 2.12, spareParts: 11, criticalParts: ["Kit empaque", "Manómetro", "Rodamiento"] },
};

export const previousWellBenchmark = {
  code: "SEC-41D",
  elapsedDays: 25,
  costPerMetre: 184.6,
  rop: 3.05,
};

export const holeDiameterMm = { HQ: 96, NQ: 75.7, PQ: 122.6 } as const;

export const raulSourceLabel = "resumen de consumibles mensual mar 2023.xlsx";
