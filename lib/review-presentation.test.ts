import { describe, expect, it } from "vitest";
import { formatCrownNumber, historicalCrownChart, hasMseResult } from "./review-presentation";
import type { compareCrownHistory } from "@/packages/domain/crown-history";
import { buildReviewMse, type RaulMseSample } from "@/packages/domain/raul-mse";
import type { OperationalShift } from "@/packages/import/types";

describe("client-facing historical comparison", () => {
  const rows = Array.from({length: 7}, (_, i) => ({brand: `Brand ${i}`, type: `Type ${i}`, ropMPerHour: i === 2 ? null : 3.08123 + i})) as ReturnType<typeof compareCrownHistory>;
  it.each([5, 7])("preserves the exact visible %s groups, order and unrounded values", count => {
    const visible = rows.slice(0, count), before = structuredClone(visible), chart = historicalCrownChart(visible);
    expect(chart.yAxis.data).toEqual(visible.map(r => `${r.brand} · ${r.type}`));
    expect(chart.yAxis.inverse).toBe(true);
    expect(chart.series[0].data).toEqual(visible.map(r => r.ropMPerHour));
    expect(chart.series[0].data[2]).toBeNull();
    for(const r of visible) {
      expect(chart.series[0].label.formatter({value:r.ropMPerHour})).toBe(formatCrownNumber(r.ropMPerHour));
      expect(chart.tooltip.valueFormatter(r.ropMPerHour)).toBe(`${formatCrownNumber(r.ropMPerHour)} m/h`);
    }
    expect(formatCrownNumber(3.08123)).toBe(formatCrownNumber(3.08));
    expect(visible).toEqual(before);
  });
});

describe("MSE presentation gate (does not alter engine results)", () => {
  const row = (diameter:string|null) => ({logicalKey:"synthetic", rigCode:"SYNTHETIC", holeCode:"TEST", date:"2026-01-01", shiftType:"day", diameter, startDepthM:0, endDepthM:12, advanceM:12, drillingHours:6, parameters:{pulldownPsi:300, rpm:600, torque:100}, source:{file:"synthetic.xlsx",sheet:"synthetic",cells:{}}}) as OperationalShift;
  it.each(["HQ", "NQ"])("retains valid %s calculation and details", family => {
    const sample=buildReviewMse([row(family)])[0];
    expect(hasMseResult(sample)).toBe(true);
    expect(sample.formula).toContain("Pulldown");
  });
  it.each(["PQ", "unknown", null])("hides unsupported %s without changing the original status", family => {
    const sample=buildReviewMse([row(family)])[0], before=structuredClone(sample);
    expect(hasMseResult(sample)).toBe(false);
    expect(sample).toEqual(before);
    expect(sample.status).toBe("unsupported_family");
  });
  it("hides missing/nonfinite results even for HQ, but retains zero", () => {
    const sample=buildReviewMse([row("HQ")])[0];
    for(const value of [null,NaN,Infinity])expect(hasMseResult({...sample,value} as RaulMseSample)).toBe(false);
    expect(hasMseResult({...sample,value:0} as RaulMseSample)).toBe(true);
    expect(hasMseResult(undefined)).toBe(false);
  });
});
