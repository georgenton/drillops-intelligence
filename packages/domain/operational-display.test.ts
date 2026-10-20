import { describe, expect, it } from "vitest";
import { observedDepth, shiftUtilization } from "./operational-display";

describe("approved operational display semantics", () => {
  it("uses twelve scheduled hours; preserves missing, explicit zero and invalid", () => {
    expect(shiftUtilization(6)).toBe(50);
    expect(shiftUtilization(0)).toBe(0);
    for (const value of [null, NaN, -1, 13]) expect(shiftUtilization(value)).toBeNull();
  });
  it("uses the latest valid cut rather than max depth or sum", () => {
    expect(observedDepth([
      { date: "2026-01-01", shiftType: "night", holeCode: "A", endDepthM: 100 },
      { date: "2026-01-02", shiftType: "day", holeCode: "A", endDepthM: 95 },
      { date: "2026-01-02", shiftType: "night", holeCode: "A", endDepthM: null },
    ])).toBe(95);
  });
  it("does not select an arbitrary hole or conflicting simultaneous reading", () => {
    const base = { date: "2026-01-01", shiftType: "day", holeCode: "A", endDepthM: 100 };
    expect(observedDepth([base, { ...base, holeCode: "B" }])).toBeNull();
    expect(observedDepth([base, { ...base, endDepthM: 101 }])).toBeNull();
    expect(observedDepth([])).toBeNull();
  });
});
