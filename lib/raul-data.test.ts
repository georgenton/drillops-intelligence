import { describe, expect, it } from "vitest";
import {
  historicalConsumableWells,
  raulMarchConsumableItems,
  raulMarchRigCosts,
  raulMonthlyConsumableCosts,
} from "./raul-data";

describe("datos reconciliados de Raúl", () => {
  const marchTotal = raulMonthlyConsumableCosts.find((row) => row.month === "Mar 2023")?.cost ?? 0;

  it("reconcilia marzo contra el total por taladro", () => {
    expect(raulMarchRigCosts.reduce((sum, row) => sum + row.cost, 0)).toBeCloseTo(marchTotal, 6);
  });

  it("reconcilia marzo contra la composición por insumo", () => {
    expect(raulMarchConsumableItems.reduce((sum, row) => sum + row.cost, 0)).toBeCloseTo(marchTotal, 6);
  });

  it("conserva los costos totales por pozo sin inventar metraje", () => {
    expect(historicalConsumableWells).toHaveLength(5);
    expect(historicalConsumableWells.every((row) => row.cost > 0 && row.metres === null)).toBe(true);
  });
});
