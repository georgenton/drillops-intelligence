import {beforeEach,describe,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
import type {PrivateSession} from "./private-auth";
import type {OperationalShift} from "@/packages/import/types";
import {quickRecordSchema,type StoredQuickRecord} from "@/packages/domain/quick-operation-records";
const db=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("./operational-db",()=>({tenantTransaction:vi.fn(async(_tenant,work)=>work(db))}));
import {canWriteQuickRecord,redactQuickRecords,saveQuickRecord,validateQuickRecordAgainstShift} from "./quick-operation-records";
const session:PrivateSession={tenantId:"a",userId:"u",role:"operations_supervisor",plan:"Premium",email:"test@example.invalid",name:"Synthetic"};
const shift={startDepthM:10,endDepthM:20,drillingHours:5,totalHours:12} as OperationalShift;
const input={kind:"interval" as const,requestId:randomUUID(),logicalKey:"shift-a",shiftRevision:1,reason:"Medición comprobada",record:{startDepthM:10,endDepthM:11.5,minutes:20}};
beforeEach(()=>{db.query.mockReset();db.query.mockImplementation(async(sql:string)=>({rows:sql.includes("FOR UPDATE")?[{payload:shift,revision:1}]:sql.startsWith("INSERT")?[{id:"saved"}]:[],rowCount:0}));});
describe("supplemental quick records",()=>{
 it("accepts 1.5,3 and real nonstandard interval lengths, rejects inverted depths",()=>{
  for(const endDepthM of [11.5,13,12.3])expect(quickRecordSchema.safeParse({...input,record:{...input.record,endDepthM}}).success).toBe(true);
  expect(quickRecordSchema.safeParse({...input,record:{...input.record,endDepthM:9}}).success).toBe(false);
 });
 it("bounds interval and crown change to known shift depths",()=>{
  expect(()=>validateQuickRecordAgainstShift(quickRecordSchema.parse(input),shift)).not.toThrow();
  expect(()=>validateQuickRecordAgainstShift(quickRecordSchema.parse(input),{...shift,startDepthM:null})).toThrow("DEPTH_BOUNDS_REQUIRED");
  expect(()=>validateQuickRecordAgainstShift(quickRecordSchema.parse({...input,record:{...input.record,startDepthM:9}}),shift)).toThrow("OUTSIDE_SHIFT");
  expect(()=>validateQuickRecordAgainstShift(quickRecordSchema.parse({...input,record:{...input.record,minutes:301}}),shift)).toThrow("DURATION_EXCEEDS_SHIFT");
 });
 it("rejects missing quantities, mismatched serials, invalid local time and tenant injection",()=>{
  expect(quickRecordSchema.safeParse({...input,tenantId:"other"}).success).toBe(false);
  expect(quickRecordSchema.safeParse({...input,kind:"consumption",record:{item:"Agua",unit:"L",quantity:0}}).success).toBe(false);
  expect(quickRecordSchema.safeParse({...input,kind:"event",record:{label:"Revisión",hours:1,time:"25:00"}}).success).toBe(false);
  expect(quickRecordSchema.safeParse({...input,kind:"crown_change",record:{previousSerial:"C1",nextSerial:"C1",depthM:11}}).success).toBe(false);
 });
 it.each(["operational_reviewer","client"] as const)("denies %s all writes",async role=>{
  for(const kind of ["interval","event","crown_change","consumption"] as const)expect(canWriteQuickRecord({...session,role},kind)).toBe(false);
  await expect(saveQuickRecord({...session,role},input)).rejects.toThrow("FORBIDDEN");expect(db.query).not.toHaveBeenCalled();
 });
 it("keeps plan/demo and field-role restrictions",()=>{
  expect(canWriteQuickRecord({...session,demo:true},"event")).toBe(false);
  expect(canWriteQuickRecord({...session,plan:"Básico"},"crown_change")).toBe(false);
  expect(canWriteQuickRecord({...session,role:"driller"},"interval")).toBe(true);
  expect(canWriteQuickRecord({...session,role:"control"},"consumption")).toBe(true);
  expect(canWriteQuickRecord({...session,role:"control"},"event")).toBe(false);
 });
 it("filters reading using each corresponding section",()=>{
  const records=(["interval","event","crown_change","consumption"] as const).map(kind=>({id:kind,kind,logicalKey:"s",payload:{},createdAt:"now"})) as StoredQuickRecord[];
  expect(redactQuickRecords(records,{...session,role:"control"}).map(r=>r.kind)).toEqual(["consumption"]);
  expect(redactQuickRecords(records,{...session,plan:"Básico"}).map(r=>r.kind)).not.toContain("crown_change");
 });
 it("persists supplemental record and never updates shift totals or crown snapshots",async()=>{
  expect(await saveQuickRecord(session,input)).toEqual({ok:true,id:"saved",duplicate:false});
  expect(db.query.mock.calls.some(([sql])=>sql.startsWith("UPDATE"))).toBe(false);
  const insert=db.query.mock.calls.find(([sql])=>sql.startsWith("INSERT"));
  expect(insert?.[1]).toEqual(["a","shift-a",input.requestId,"interval",JSON.stringify(input.record),1,input.reason,"u"]);
 });
 it("rejects changed source revision before recording",async()=>{
  db.query.mockImplementation(async(sql:string)=>({rows:sql.includes("FOR UPDATE")?[{payload:shift,revision:2}]:[]}));
  await expect(saveQuickRecord(session,input)).rejects.toThrow("REVISION_CONFLICT");
  expect(db.query.mock.calls.some(([sql])=>sql.startsWith("INSERT"))).toBe(false);
 });
 it("refuses overlaps and unknown/foreign source shifts",async()=>{
  db.query.mockImplementation(async(sql:string)=>({rows:sql.includes("FOR UPDATE")?[{payload:shift,revision:1}]:[],rowCount:sql.includes("kind='interval'")?1:0}));
  await expect(saveQuickRecord(session,input)).rejects.toThrow("INTERVAL_OVERLAP");
  db.query.mockResolvedValue({rows:[],rowCount:0});await expect(saveQuickRecord(session,input)).rejects.toThrow("SHIFT_NOT_FOUND");
 });
 it("idempotent request replay returns original without reapplying; changed payload conflicts",async()=>{
  db.query.mockImplementation(async(sql:string)=>({rows:sql.includes("SELECT id,logical_key")?[{id:"original",same:true,logical_key:input.logicalKey,kind:input.kind,reason:input.reason,shift_revision:1}]:[]}));
  expect(await saveQuickRecord(session,input)).toEqual({ok:true,id:"original",duplicate:true});
  expect(db.query.mock.calls.some(([sql])=>sql.startsWith("INSERT"))).toBe(false);
  db.query.mockImplementation(async(sql:string)=>({rows:sql.includes("SELECT id,logical_key")?[{same:false}]:[]}));
  await expect(saveQuickRecord(session,input)).rejects.toThrow("REQUEST_CONFLICT");
 });
});
