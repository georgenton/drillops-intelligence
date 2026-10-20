import { describe,it,expect } from "vitest";
import type { OperationalReport } from "@/packages/import/types";
import { buildReviewSurvey } from "./review-survey";
const report=(key:string,dip=-80):OperationalReport=>({key,date:"2026-05-01",rigCode:"TEST",holeCode:"HOLE",source:{file:`${key}.xlsx`,fileSha256:"synthetic",sheet:"TEST"},survey:[{key:`${key}-1`,depthM:30,dip:-90,azimuth:40,reference:null,equipment:null,valid:true,cells:{},warnings:[]},{key:`${key}-2`,depthM:60,dip,azimuth:50,reference:null,equipment:null,valid:true,cells:{},warnings:[]}],consumptions:[],materials:[],fluidParameters:[],equipmentHours:[]});
describe("review-only survey reconstruction",()=>{
 it("anchors first measured MD locally and labels nominal azimuth",()=>{
  const value=buildReviewSurvey([report("a")]);
  expect(value.configuration.anchor).toEqual({depthM:30,eastM:0,northM:0,tvdM:0});
  expect(value.configuration.azimuthReference).toBe("nominal_unverified");
  expect(value.points[0]).toMatchObject({depth:30,tvd:0,north:0,east:0});
  expect(value.classification).toBe("DERIVADO");expect(value.points).toHaveLength(2);
 });
 it("selects contradictions deterministically without altering sources",()=>{
  const a=report("a"),b=report("b",-60),before=JSON.stringify([a,b]);
  expect(buildReviewSurvey([a,b])).toEqual(buildReviewSurvey([b,a]));
  expect(buildReviewSurvey([a,b]).selection.filter(s=>s.action==="conflict")).toHaveLength(1);
  expect(JSON.stringify([a,b])).toBe(before);
 });
 it("fallback is separate synthetic series shared by 2D and 3D",()=>{
  const value=buildReviewSurvey([]);
  expect(value.classification).toBe("SINTETICO");expect(value.context).toContain("Referencia sintética");
  expect(value.points.map(p=>p.depth)).toEqual(value.stations.map(s=>s.depthM));expect(value.coveragePercent).toBe(0);
 });
 it("preserves confirmed convention and reference rather than replacing them",()=>{
  const value=buildReviewSurvey([report("a")],{angleConvention:"dip_negative_down",azimuthReference:"magnetic_north",method:"minimum_curvature",anchor:{depthM:30,eastM:1,northM:2,tvdM:3},evidence:"Synthetic confirmed fixture"});
  expect(value.configuration.azimuthReference).toBe("magnetic_north");expect(value.points[0].east).toBe(1);
 });
});
