import {describe,it,expect} from "vitest";
import {appendQuickConsumptions} from "./quick-report-consumptions";
import type {OperationalReport,OperationalShift} from "@/packages/import/types";
import type {StoredQuickRecord} from "./quick-operation-records";
const shift={logicalKey:"shift",date:"2026-01-01",rigCode:"R1",holeCode:"H1",shiftType:"day",advanceM:10,drillingHours:5} as OperationalShift;
const report={key:"persisted",date:shift.date,rigCode:"R1",holeCode:"H1",consumptions:[]} as unknown as OperationalReport;
const record={id:"id",kind:"consumption",logicalKey:"shift",payload:{item:"Aditivo",quantity:2,unit:"kg"},createdAt:"now"} as StoredQuickRecord;
describe("manual consumption projection",()=>{
 it("adds once to a persisted report without changing source or shift metrics",()=>{
  const result=appendQuickConsumptions([report], [shift], [record,record]);
  expect(result[0].key).toBe("persisted");expect(result[0].consumptions).toHaveLength(1);
  expect(result[0].consumptions[0]).toMatchObject({value:2,unit:"kg",shiftType:"day"});
  expect(report.consumptions).toEqual([]);expect(shift.advanceM).toBe(10);expect(shift.drillingHours).toBe(5);
 });
 it("does not invent reports or cross filtered shift/context boundaries",()=>{
  expect(appendQuickConsumptions([], [shift], [record])).toEqual([]);
  expect(appendQuickConsumptions([report], [], [record])[0].consumptions).toEqual([]);
  expect(appendQuickConsumptions([{...report,holeCode:"H2"}], [shift], [record])[0].consumptions).toEqual([]);
 });
 it("does not count one manual entry twice when source reports share a context",()=>{
  const result=appendQuickConsumptions([{...report,key:"b"},{...report,key:"a"}],[shift],[record]);
  expect(result.map(r=>r.consumptions.length)).toEqual([0,1]);
 });
});
