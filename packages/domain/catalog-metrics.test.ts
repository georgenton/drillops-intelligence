import { describe, expect, it } from "vitest";
import { mechanicalAvailability, programmedMetres, rigEstimatePerMetre } from "./catalog-metrics";
import type { OperationalCatalog } from "./operational-catalog";
import type { OperationalShift } from "@/packages/import/types";
const catalog={rigs:[{code:"R1",hourlyCostUsd:100,mechanicalDowntimeActivities:["MANTENIMIENTO"],mechanicalClassificationEvidence:"Clasificación sintética autorizada"}],holes:[{code:"H1",source:"configured",planStartDate:"2026-05-01",guardsPerDay:2,plannedMetersPerShift:10}],crowns:[]} as unknown as OperationalCatalog;
const shift={rigCode:"R1",advanceM:10,drillingHours:5,totalHours:12,activities:[{label:"PERFORACIÓN",hours:5},{label:"MANTENIMIENTO",hours:2},{label:"STANDBY",hours:5}]} as OperationalShift;
describe("configured operational metrics",()=>{
  it("does not infer a schedule from actuals and aligns the visible cumulative origin",()=>{
    expect(programmedMetres(null,["H1"],["2026-05-03"])).toEqual([null]);
    expect(programmedMetres(catalog,["H1"],["2026-05-03","2026-05-04"])).toEqual([20,40]);
    expect(programmedMetres(catalog,["H1","UNKNOWN"],["2026-05-03"])).toEqual([null]);
  });
  it("classifies only explicitly configured downtime and reports coverage",()=>{
    const result=mechanicalAvailability([shift],catalog);
    expect(result.value).toBeCloseTo(100*10/12);
    expect(result).toMatchObject({downtimeHours:2,coveredShifts:1,totalShifts:1});
    expect(mechanicalAvailability([shift],null).value).toBeNull();
    expect(mechanicalAvailability([{...shift,totalHours:11}],catalog).value).toBeNull();
  });
  it("estimates the rig component with hours and explicit tariffs, never absent prices as zero",()=>{
    expect(rigEstimatePerMetre([shift],catalog)).toBe(50);
    expect(rigEstimatePerMetre([{...shift,rigCode:"MISSING"}],catalog)).toBeNull();
    expect(rigEstimatePerMetre([{...shift,advanceM:null}],catalog)).toBeNull();
  });
});
