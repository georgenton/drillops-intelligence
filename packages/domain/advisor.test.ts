import { describe, expect, it } from "vitest";
import { recommendCrowns } from "./advisor";
import type { Crown } from "./types";

const crowns: Crown[] = [
  { id:"fast", tenantId:"extract", manufacturer:"A", product:"Fast", matrix:"X", diameter:"HQ", price:1, stock:3, reserved:0, reorder:2, historicalRop:5, historicalCost:50, historicalLife:180, observations:20, hardnessFit:[4], fracturingFit:["high"] },
  { id:"cheap", tenantId:"extract", manufacturer:"B", product:"Cheap", matrix:"Y", diameter:"HQ", price:1, stock:4, reserved:0, reorder:2, historicalRop:3, historicalCost:25, historicalLife:220, observations:7, hardnessFit:[4], fracturingFit:["high"] },
];

describe("Bit Advisor", () => {
  it("cambia el ranking según prioridad", () => {
    const base = { tenantId:"extract" as const, diameter:"HQ" as const, hardness:4, fracturing:"high" as const, abrasivity:"high" as const, waterReturn:"partial" as const };
    expect(recommendCrowns(crowns, { ...base, priority:"speed" })[0].crown.id).toBe("fast");
    expect(recommendCrowns(crowns, { ...base, priority:"cost" })[0].crown.id).toBe("cheap");
  });
  it("excluye coronas de otro diámetro", () => {
    expect(recommendCrowns(crowns, { tenantId:"extract", diameter:"NQ", hardness:3, fracturing:"low", abrasivity:"low", waterReturn:"complete", priority:"balanced" })).toHaveLength(0);
  });
});
