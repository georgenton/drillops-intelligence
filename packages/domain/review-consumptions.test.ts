import {describe,it,expect} from "vitest";
import type {OperationalReport,ReportMeasurement} from "@/packages/import/types";
import {reviewConsumptions} from "./review-consumptions";
function report(key:string,value:number|null,unit:string|null="gal",rig="TEST",validity:ReportMeasurement["validity"]="observed",label="Diesel"):OperationalReport {
 return {key,date:"2026-05-01",rigCode:rig,holeCode:"HOLE",source:{file:`${key}.xlsx`,sheet:rig,fileSha256:"synthetic"},survey:[],materials:[],equipmentHours:[],fluidParameters:[],consumptions:[{key:`${key}-diesel`,label,value,unit,shiftType:"day",validity,cells:{value:{cell:"A1",raw:value,formula:null,unit}},warnings:[]}]};
}
describe("review consumption estimation, separate from observations",()=>{
 it("keeps valid originals including explicit zero and source cells",()=>{
  const output=reviewConsumptions([report("a",0),report("b",8)]);
  expect(output[0]).toMatchObject({kind:"EXCEL",value:0,original:0,unit:"gal",source:{file:"a.xlsx",cells:{value:{cell:"A1",raw:0}}}});
  expect(output[1].value).toBe(8);
 });
 it("uses median and reports the exact support and range",()=>{
  const output=reviewConsumptions([report("a",10),report("b",20),report("c",100),report("missing",null)]).at(-1)!;
  expect(output).toMatchObject({kind:"SUPUESTO",value:20,original:null,range:[10,100]});expect(output.support.map(s=>s.value)).toEqual([10,20,100]);
  expect(reviewConsumptions([report("a",10),report("b",20),report("missing",null)]).at(-1)?.value).toBe(15);
 });
 it("never mixes equipment, labels or units in comparable observations",()=>{
  const output=reviewConsumptions([report("a",10),report("litres",500,"L"),report("other",800,"gal","OTHER"),report("water",900,"gal","TEST","observed","Agua"),report("missing",null)]).at(-1)!;
  expect(output.value).toBe(10);expect(output.support).toHaveLength(1);expect(output.unit).toBe("gal");
 });
 it("missing units do not create a made-up numeric consumption",()=>{
  const output=reviewConsumptions([report("unknown",null,null)])[0];expect(output.value).toBeNull();expect(output.unit).toBeNull();
 });
 it("creates only explicitly labelled synthetic references when no comparable exists",()=>{
  expect(reviewConsumptions([report("missing",null)])[0]).toMatchObject({kind:"SINTETICO",value:20,support:[]});
  expect(reviewConsumptions([report("water",null,"m3","TEST","observed","Agua")])[0]).toMatchObject({kind:"SINTETICO",value:2,unit:"m3"});
 });
 it("is deterministic and never mutates the original report",()=>{
  const input=[report("a",10),report("b",null)],before=JSON.stringify(input);const first=reviewConsumptions(input);expect(reviewConsumptions(input)).toEqual(first);expect(JSON.stringify(input)).toBe(before);
  first[1].value=999;expect(input[1].consumptions[0].value).toBeNull();
 });
 it("negative observations are excluded from median rather than treated as zero",()=>{
  const output=reviewConsumptions([report("negative",-100),report("positive",6),report("missing",null)]);expect(output[2].value).toBe(6);expect(output[2].support).toHaveLength(1);
 });
});
