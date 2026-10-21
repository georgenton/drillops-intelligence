import { describe, expect, it } from "vitest";
import { activityColor, fluidSeries, guardiaTotals, maintenanceHours, reviewEquipmentCost, rigConsumptionTotals, reviewPressureSeries } from "./operational-review-v2";
import type { OperationalReport, OperationalShift, ReportMeasurement } from "@/packages/import/types";
const shift=(key:string,advanceM:number|null,drillingHours:number|null,shiftType:"day"|"night"="day")=>({logicalKey:key,advanceM,drillingHours,shiftType,activities:[]} as unknown as OperationalShift);
const measurement=(key:string,value:number|null,shiftType:"day"|"night"|null,unit="gls")=>({key,label:"Agua",value,shiftType,unit,validity:value===null?"missing":"observed",cells:{},warnings:[]} as ReportMeasurement);
const report=(consumptions:ReportMeasurement[])=>({key:"r1",date:"2026-05-01",rigCode:"R1",holeCode:"H1",consumptions,fluidParameters:[],source:{file:"synthetic.xlsx",sheet:"01",fileSha256:"synthetic"}} as unknown as OperationalReport);
describe("review v2 operational metrics",()=>{
  it("sums day/night and computes total paired ROP rather than averaging two ROPs",()=>{
    const rows=guardiaTotals([shift("d",20,2),shift("n",30,10,"night"),shift("missing",90,null),shift("zero",0,0),shift("invalid",4,0)]);
    expect(rows[0]).toMatchObject({advanceM:114,drillingHours:2,ropMPerHour:10,excludedKeys:["missing","invalid"]});
    expect(rows[1].ropMPerHour).toBe(3);
    expect(rows[2].ropMPerHour).toBeCloseTo(50/12);
    expect(rows[2].ropMPerHour).not.toBe(6.5);
  });
  it("never treats absent measurements as zero or returns infinite ROP",()=>{
    expect(guardiaTotals([shift("a",null,null)])[2]).toMatchObject({advanceM:null,drillingHours:null,ropMPerHour:null});
    expect(guardiaTotals([shift("a",10,0)])[2].ropMPerHour).toBeNull();
    expect(guardiaTotals([shift("a",Infinity,2)])[2].ropMPerHour).toBeNull();
  });
  it("does not duplicate report totals or reports and never combines units",()=>{
    const r=report([measurement("d",10,"day"),measurement("n",20,"night"),measurement("total",30,null),measurement("litres",50,"day","L")]);
    expect(rigConsumptionTotals([r,r],"R1")).toEqual([
      {label:"Agua",unit:"gls",day:10,night:20,report:null,total:30,missing:0,excludedTotals:["r1|total"]},
      {label:"Agua",unit:"L",day:50,night:null,report:null,total:50,missing:0,excludedTotals:[]},
    ]);
    expect(rigConsumptionTotals([report([measurement("d",null,"day"),measurement("total",20,null)])],"R1")[0].total).toBeNull();
  });
  it("counts only maintenance labels, not all non-drilling hours",()=>{
    const s={...shift("d",20,2),activities:[{label:"Mantenimiento preventivo",hours:1,cell:"A1"},{label:"Reparación",hours:2,cell:"A2"},{label:"Standby",hours:5,cell:"A3"},{label:"Mudanza",hours:2,cell:"A4"}]};
    expect(maintenanceHours([s])).toMatchObject({total:3,day:3,night:null});
  });
  it("keeps daily pressure and caudal separate from consumption and shift pulldown",()=>{
    const r={...report([measurement("water",900,"day")]),fluidParameters:[{...measurement("pressure",100,null,"PSI"),label:"Presión"},{...measurement("flow",20,null,"L/min"),label:"Caudal"}]};
    expect(fluidSeries([r,r],"Presión")).toHaveLength(1);
    expect(fluidSeries([r],"Caudal")[0]).toMatchObject({value:20,unit:"L/min",shiftType:null});
    expect(reviewPressureSeries([r])).toEqual([]);
    expect(reviewPressureSeries([report([])])[0]).toMatchObject({value:100,unit:"PSI",classification:"SINTETICO",original:null});
  });
  it("uses a shared partial cost and fixed distinct activity colors",()=>{
    expect(reviewEquipmentCost([shift("d",20,2),shift("n",30,10,"night")],100)).toMatchObject({cost:1200,perMetre:24});
    expect(reviewEquipmentCost([],100).perMetre).toBeNull();
    expect(activityColor("Mudanza",0)).not.toBe(activityColor("Perforación",2));
    expect(activityColor("Mudanza",0)).toBe(activityColor("Mudanza",5));
  });
});
