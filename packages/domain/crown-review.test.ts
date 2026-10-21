import { describe,it,expect } from "vitest";
import { crownReview } from "./crown-review";
import type { CrownHistory, CrownHistoryRun } from "./crown-history";
const run: CrownHistoryRun = {id:"a",rigCode:"R1",holeCode:"H1",serial:"A",type:"HQ",brand:"Example",startDepthM:10,endDepthM:30,firstObservedDate:"2026-01-01",lastObservedDate:"2026-01-01",snapshotCount:1,state:"END_REPORTED",reportedMetresM:20,attributedMetresM:20,attributedHours:5,ropMPerHour:2,shiftKeys:["s1"],regimeConfirmed:false,reasons:[]};
const history=(runs:CrownHistoryRun[]):CrownHistory=>({version:"test",runs,attributions:[],duplicateSnapshots:0,duplicateShifts:0,uncertainShiftCount:0});
describe("Crown review projections",()=>{
 it("keeps paired numerator distinct from all attributed metres",()=>{const r=crownReview(history([run]));expect(r.rows[0].pairedMetres).toBe(10);expect(r.comparison[0].ropMPerHour).toBe(2);});
 it("shows gaps and overlaps without double-counting depth",()=>{const r=crownReview(history([run,{...run,id:"b",serial:"B",startDepthM:20,endDepthM:40}])).depth[0];expect(r.segments.map(s=>s.status)).toEqual(["GAP","REPORTED","OVERLAP","REPORTED"]);expect(r.segments.reduce((s,r)=>s+r.length,0)).toBe(40);expect(r.segments[2].runIds).toEqual(["a","b"]);});
 it("retains unknown ends outside finite bars",()=>{const r=crownReview(history([{...run,endDepthM:null}]));expect(r.depth[0].unbounded).toEqual(["a"]);expect(r.depth[0].segments).toEqual([]);});
 it("keeps null ROP null, not zero",()=>expect(crownReview(history([{...run,ropMPerHour:null,attributedHours:0}])).rows[0].pairedMetres).toBeNull());
 it("isolates equipment and keeps IDs stable across ordering",()=>{const b={...run,id:"b",rigCode:"R2"};expect(crownReview(history([run,b])).depth).toHaveLength(2);expect(crownReview(history([run,b])).depth[0].segments[1].id).toBe(crownReview(history([b,run])).depth[1].segments[1].id);});
});
