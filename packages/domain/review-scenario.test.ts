import {describe,it,expect} from "vitest";
import {buildReviewScenario} from "./review-scenario";
import {privateAdvisorRanking} from "./private-advisor";
import type {OperationalCatalog} from "./operational-catalog";
import type {OperationalShift} from "@/packages/import/types";
const catalog:OperationalCatalog={rigs:[],holes:[],crowns:[],canWriteRigs:false,canWriteHoles:false,canWriteCrowns:false,canConfigureCosts:false};
describe("explicit review scenario",()=>{
 it("is deterministic, pure and retains financial permission restrictions",()=>{
  const before=structuredClone(catalog),data={shifts:[],reports:[],crowns:[]};
  const a=buildReviewScenario(data,catalog),b=buildReviewScenario(data,catalog);
  expect(a).toEqual(b);expect(catalog).toEqual(before);expect(data).toEqual({shifts:[],reports:[],crowns:[]});
  expect(a.catalog.canConfigureCosts).toBe(false);
  expect(a.candidates.every(c=>c.stock===5&&c.reserved===1)).toBe(true);
 });
 it("has complete explicitly synthetic candidates without changing original ranking weights",()=>{
  const s=buildReviewScenario({shifts:[],reports:[],crowns:[]},catalog);
  for(const priority of ["balanced","cost","speed","life"] as const){
   const r=privateAdvisorRanking(s.candidates,{tenantId:"review",...s.advisorContext,priority},true);
   expect(r.blocked).toBeNull();expect(r.results).toHaveLength(3);
  }
  for(const c of s.candidates)for(const key of Object.keys(c))expect(s.manifest.find(e=>e.context===c.id&&e.field===key)?.kind).toBe("SINTETICO");
 });
 it("reproduces a dimensional MSE fixture and never labels it client calibration",()=>{
  const s=buildReviewScenario({shifts:[],reports:[],crowns:[]},catalog);
  expect(s.mse.value).toBeCloseTo(2251.99,-1);
  expect(s.manifest.find(e=>e.context==="MSE sintética"&&e.field==="value")?.kind).toBe("DERIVADO");
  expect(s.catalog.crowns).toEqual([]);
 });
 it("documents every radar reference and keeps all five factors",()=>{
  const s=buildReviewScenario({shifts:[],reports:[],crowns:[]},catalog);
  expect(s.analyticsRadar).toHaveLength(3);
  expect(s.analyticsRadar.every(r=>r.value.length===5&&r.value.every(v=>v>=0&&v<=5))).toBe(true);
  expect(s.manifest.find(e=>e.field==="analyticsRadar")?.value).toEqual(s.analyticsRadar);
  expect(s.benchmark.previous.hours*100).toBe(s.benchmark.previous.cost);
 });
 it("derives plans and costs without modifying observed shifts",()=>{
  const shift:OperationalShift={logicalKey:"s",date:"2023-05-01",rigCode:"R",holeCode:"H",projectCode:null,shiftType:"day",granularity:"shift",startDepthM:0,endDepthM:30,advanceM:30,drillingHours:6,totalHours:12,activities:[{label:"PERFORACION",hours:6,cell:"A1"},{label:"MANTENIMIENTO",hours:6,cell:"A2"}],parameters:{rpm:null,torque:null,torqueUnit:null,pulldownPsi:null,holdbackPsi:null},source:{file:"fixture.xlsx",fileSha256:"fixture",sheet:"01",cells:{}},warnings:[]};
  const c:OperationalCatalog={...catalog,rigs:[{code:"R",name:null,model:null,status:null,mechanicalDowntimeActivities:null,mechanicalClassificationEvidence:null,revision:0,source:"observed"}],holes:[{code:"H",rigCode:"R",targetDepthM:null,plannedMetersPerShift:null,planStartDate:null,guardsPerDay:null,status:null,surveyConfiguration:null,revision:0,source:"observed"}]};
  const before=structuredClone(shift),s=buildReviewScenario({shifts:[shift],reports:[],crowns:[]},c);
  expect(shift).toEqual(before);expect(c.holes[0].plannedMetersPerShift).toBeNull();
  expect(s.catalog.holes[0].plannedMetersPerShift).toBeCloseTo(34.5);
  expect(s.catalog.holes[0].targetDepthM).toBe(50);
  expect(s.manifest.find(e=>e.field==="rigEstimatePerMetre")?.value).toBe(20);
  expect(s.manifest.find(e=>e.field==="mechanicalAvailability")?.value).toMatchObject({value:50,coveredShifts:1});
  expect(s.mechanicalByContext[0]).toMatchObject({value:50,kind:"DERIVADO",coveredShifts:1});
  const missing=buildReviewScenario({shifts:[{...shift,totalHours:null}],reports:[],crowns:[]},c);
  expect(missing.mechanicalByContext[0]).toMatchObject({value:87.5,programmedHours:48,downtimeHours:6,coveredShifts:0,totalShifts:1,kind:"SINTETICO"});
  expect(missing.dashboardCrownByContext[0]).toMatchObject({serial:"REV-CORONA-REFERENCIA",attributedMetresM:120,kind:"SINTETICO"});
 });
});
