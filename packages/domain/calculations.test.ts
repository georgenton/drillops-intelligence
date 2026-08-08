import { describe, expect, it } from "vitest";
import { calculateRop, calculateRunCosts, calculateUtilization } from "./calculations";

describe("cálculos operacionales", () => {
  it("calcula ROP y protege división por cero", () => {
    expect(calculateRop(30, 6)).toBe(5);
    expect(calculateRop(30, 0)).toBe(0);
  });
  it("calcula utilización", () => expect(calculateUtilization(9, 12)).toBe(75));
  it("separa los costos por metro", () => {
    const r = calculateRunCosts({ entryDepth: 100, exitDepth: 200, purchaseCost: 2000, drillingHours: 25, rigHourlyCost: 120, consumablesCost: 500 });
    expect(r.bitCostPerMetre).toBe(20);
    expect(r.rigCostPerMetre).toBe(30);
    expect(r.totalCostPerMetre).toBe(55);
  });
});
