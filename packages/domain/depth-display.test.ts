import {describe,it,expect} from "vitest";
import {depthTrackSegments,depthTrackValue,validDepthRange} from "./depth-display";
import type {OperationalShift} from "@/packages/import/types";
const row=(start:number,end:number,rpm:number|null,rig="SYNTHETIC"):OperationalShift=>({logicalKey:`${rig}|${start}`,date:"2026-01-01",rigCode:rig,holeCode:"SYNTHETIC-H",startDepthM:start,endDepthM:end,advanceM:end-start,drillingHours:2,parameters:{rpm,torque:null,torqueUnit:null,pulldownPsi:null,holdbackPsi:null}} as OperationalShift);
describe("depth range presentation",()=>{
 it("joins adjacent means with a step, not interpolation",()=>expect(depthTrackSegments([row(0,10,500),row(10,20,600)],"rpm")[0].points).toEqual([[500,0],[500,10],[600,10],[600,20]]));
 it("retains real gaps and overlaps",()=>expect(depthTrackSegments([row(0,10,500),row(15,25,600),row(20,30,700)],"rpm")[0].points.filter(p=>p===null)).toHaveLength(2));
 it("missing measurement breaks line rather than zero",()=>expect(depthTrackSegments([row(0,10,500),row(10,20,null),row(20,30,700)],"rpm")[0].points).toEqual([[500,0],[500,10],null,[700,20],[700,30]]));
 it("does not join different rigs",()=>expect(depthTrackSegments([row(0,10,500),row(10,20,600,"OTHER")],"rpm")).toHaveLength(2));
 it("rejects inverted/zero ranges and preserves absent physical tracks",()=>{expect(validDepthRange(row(10,5,500))).toBe(false);expect(validDepthRange(row(10,10,500))).toBe(false);expect(depthTrackValue(row(0,10,500),"mse")).toBeNull();});
});
