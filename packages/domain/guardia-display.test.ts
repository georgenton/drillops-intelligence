import {describe,it,expect} from "vitest";
import {guardiaSeries} from "./guardia-display";
import type {OperationalShift} from "@/packages/import/types";
import type {OperationalCatalog} from "./operational-catalog";
const row=(rig:string,date:string,type:"day"|"night",advanceM:number|null)=>({rigCode:rig,holeCode:"H1",date,shiftType:type,advanceM} as OperationalShift);
describe("guardia by machine",()=>{
 it("keeps machines separate, day green and night blue",()=>{const result=guardiaSeries([row("R1","2026-05-01","day",10),row("R2","2026-05-01","day",20)],null);expect(result.series.find(s=>s.name==="R1 · Día")).toMatchObject({values:[10],color:"#41d6a3"});expect(result.series.find(s=>s.name==="R2 · Día")?.values).toEqual([20]);expect(result.series.find(s=>s.name==="R1 · Noche")).toMatchObject({values:[null],color:"#2389ba"});});
 it("retains unreported days as null and explicit zero as zero",()=>{const result=guardiaSeries([row("R1","2026-05-01","day",0),row("R1","2026-05-03","day",5)],null);expect(result.dates).toHaveLength(3);expect(result.series[0].values).toEqual([0,null,5]);});
 it("uses configured guard target, never actual production",()=>{const catalog={holes:[{code:"H1",rigCode:"R1",planStartDate:"2026-05-02",plannedMetersPerShift:30}]} as OperationalCatalog;const result=guardiaSeries([row("R1","2026-05-01","day",7)],catalog,{to:"2026-05-03"});expect(result.series[2].values).toEqual([null,30,30]);});
 it("does not invent targets for ambiguous holes",()=>{const rows=[row("R1","2026-05-01","day",7),{...row("R1","2026-05-01","night",8),holeCode:"H2"}];expect(guardiaSeries(rows,null).series[2].values).toEqual([null]);});
});
