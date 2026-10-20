import { beforeEach, describe, expect, it, vi } from "vitest";
import { catalogMutationSchema, holeCatalogSchema, rigCatalogSchema, crownCatalogSchema, mseCalibrationSchema } from "@/packages/domain/operational-catalog";
import type { PrivateSession } from "./private-auth";
const db=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("./operational-db",()=>({tenantTransaction:vi.fn(async(_tenant,work)=>work(db))}));
import { assertCatalogWrite, catalogCapabilities, readCatalog, redactCatalog, saveCatalog } from "./operational-catalog";

const manager:PrivateSession={tenantId:"tenant-a",userId:"actor-a",role:"general_manager",plan:"Premium",email:"test@example.invalid",name:"Test"};
const rig={kind:"rig" as const,record:{code:"ex01"},reason:"Alta comprobada"};
beforeEach(()=>{db.query.mockReset();db.query.mockResolvedValue({rows:[]});});
describe("catalog schema, authorization and redaction",()=>{
 it("keeps absent values null, explicit zero measurable, normalized code",()=>{
  expect(rigCatalogSchema.parse({code:" ex01 "}).code).toBe("EX01");
  const hole=holeCatalogSchema.parse({code:"s1",rigCode:"ex01",plannedMetersPerShift:0});
  expect(hole.targetDepthM).toBeNull();expect(hole.planStartDate).toBeNull();expect(hole.guardsPerDay).toBeNull();expect(hole.plannedMetersPerShift).toBe(0);
 });
 it("rejects tenant injection, invalid dates, negative tariffs and missing survey conventions",()=>{
  expect(catalogMutationSchema.safeParse({...rig,tenantId:"other"}).success).toBe(false);
  expect(holeCatalogSchema.safeParse({code:"s1",rigCode:"ex01",planStartDate:"2026-02-30"}).success).toBe(false);
  expect(rigCatalogSchema.safeParse({code:"x",hourlyCostUsd:-1}).success).toBe(false);
  expect(holeCatalogSchema.safeParse({code:"s1",rigCode:"ex01",surveyConfiguration:{}}).success).toBe(false);
 });
 it("requires explicit mechanical classification with evidence, accepts confirmed empty set",()=>{
  expect(rigCatalogSchema.parse({code:"EX01"}).mechanicalDowntimeActivities).toBeNull();
  expect(rigCatalogSchema.safeParse({code:"EX01",mechanicalDowntimeActivities:["MANTENIMIENTO"]}).success).toBe(false);
  expect(rigCatalogSchema.safeParse({code:"EX01",mechanicalClassificationEvidence:"Confirmado por responsable"}).success).toBe(false);
  expect(rigCatalogSchema.parse({code:"EX01",mechanicalDowntimeActivities:[],mechanicalClassificationEvidence:"Ninguna categoría clasificada como avería"}).mechanicalDowntimeActivities).toEqual([]);
 });
 it.each(["client","operational_reviewer","driller","control"] as const)("denies %s catalog writes",role=>{
  expect(()=>assertCatalogWrite({...manager,role},catalogMutationSchema.parse(rig))).toThrow("FORBIDDEN");
 });
 it("does not broaden supervisor financial permissions or demo writes",()=>{
  expect(catalogCapabilities({...manager,role:"operations_supervisor"})).toEqual({canWriteRigs:true,canWriteHoles:true,canWriteCrowns:true,canConfigureCosts:false});
  expect(()=>assertCatalogWrite({...manager,role:"operations_supervisor"},catalogMutationSchema.parse({...rig,record:{code:"EX01",hourlyCostUsd:null}}))).toThrow("COST_FORBIDDEN");
  expect(()=>assertCatalogWrite({...manager,demo:true},catalogMutationSchema.parse(rig))).toThrow("FORBIDDEN");
 });
 it("removes cost field itself from reader payload without falsifying it as zero",()=>{
  const catalog={rigs:[{...rigCatalogSchema.parse({code:"EX01",hourlyCostUsd:75}),revision:1,source:"configured" as const}],holes:[],crowns:[{...crownCatalogSchema.parse({code:"C1",priceUsd:100,referenceLifeM:200}),revision:1,source:"configured" as const}],...catalogCapabilities(manager)};
  const redacted=redactCatalog(catalog,{...manager,role:"operational_reviewer"});
  expect(redacted.rigs[0]).not.toHaveProperty("hourlyCostUsd");expect(catalog.rigs[0].hourlyCostUsd).toBe(75);
  expect(redacted.crowns[0]).not.toHaveProperty("priceUsd");expect(redacted.crowns[0].referenceLifeM).toBe(200);expect(redacted.crowns[0]).not.toHaveProperty("historicalLife");
 });
 it("gates crown configuration by commercial plan and costs separately",()=>{
  const crown=catalogMutationSchema.parse({kind:"crown",record:{code:"C1"},reason:"Catálogo revisado"});
  expect(()=>assertCatalogWrite({...manager,plan:"Básico"},crown)).toThrow("FORBIDDEN");
  expect(()=>assertCatalogWrite({...manager,role:"operations_supervisor"},catalogMutationSchema.parse({...crown,record:{code:"C1",priceUsd:10}}))).toThrow("COST_FORBIDDEN");
 });
 it("requires scoped physical measurement, explicit units and annular geometry",()=>{
  const mse={rigCode:"EX01",holeCode:"S1",date:"2026-05-01",depthM:10,wobN:1000,torqueNm:200,rpm:600,ropMetresPerHour:2,outerDiameterM:.1,coreDiameterM:.06,unitsConfirmed:true,geometryConfirmed:true,measurementLocation:"downhole",evidence:"Medición confirmada"};
  expect(mseCalibrationSchema.safeParse(mse).success).toBe(true);
  expect(mseCalibrationSchema.safeParse({...mse,unitsConfirmed:false}).success).toBe(false);
  expect(mseCalibrationSchema.safeParse({...mse,coreDiameterM:.2}).success).toBe(false);
  expect(mseCalibrationSchema.safeParse({...mse,ropMetresPerHour:0}).success).toBe(false);
 });
});
describe("catalog service transactions",()=>{
 it("preserves existing Survey configuration when a plan without Survey edits a hole",async()=>{
  const surveyConfiguration={angleConvention:"inclination_from_vertical",azimuthReference:"true_north",method:"minimum_curvature",anchor:{depthM:0,eastM:0,northM:0,tvdM:0},evidence:"Synthetic confirmed anchor"};
  const payload=holeCatalogSchema.parse({code:"S1",rigCode:"EX01",surveyConfiguration});
  db.query.mockImplementation(async(sql:string)=>({rows:sql.includes("FOR UPDATE")?[{payload,revision:1}]:sql.includes("SELECT DISTINCT")?[{rig:"EX01",hole:"S1"}]:[]}));
  await saveCatalog({...manager,plan:"Básico"},{kind:"hole",record:{code:"S1",rigCode:"EX01",surveyConfiguration:null},revision:1,reason:"Actualizar meta autorizada"},"update");
  const write=db.query.mock.calls.find(([sql])=>sql.startsWith("INSERT INTO operational_catalog("));
  expect(JSON.parse(write?.[1][3]).surveyConfiguration).toEqual(surveyConfiguration);
 });
 it("creates with tenant scoped parameters and revision audit",async()=>{
  const result=await saveCatalog(manager,rig,"create");
  expect(result).toEqual({ok:true,kind:"rig",code:"EX01",revision:1});
  const audit=db.query.mock.calls.find(([sql])=>sql.startsWith("INSERT INTO operational_catalog_revisions"));
  expect(audit?.[1]).toEqual(["tenant-a","rig","EX01",null,expect.any(String),1,"Alta comprobada","actor-a"]);
 });
 it("rejects stale revision before writes",async()=>{
  db.query.mockImplementation(async(sql:string)=>({rows:sql.includes("FOR UPDATE")?[{payload:{code:"EX01"},revision:3}]:[]}));
  await expect(saveCatalog(manager,{...rig,revision:2},"update")).rejects.toThrow("REVISION_CONFLICT");
  expect(db.query.mock.calls.some(([sql])=>sql.startsWith("INSERT"))).toBe(false);
 });
 it("does not allow update without revision or create with one",async()=>{
  await expect(saveCatalog(manager,rig,"update")).rejects.toThrow("REVISION_REQUIRED");
  await expect(saveCatalog(manager,{...rig,revision:1},"create")).rejects.toThrow("INVALID_CREATE_REVISION");
  expect(db.query).not.toHaveBeenCalled();
 });
 it("rejects an association with an unknown or other-tenant rig",async()=>{
  await expect(saveCatalog(manager,{kind:"hole",record:{code:"S1",rigCode:"FOREIGN"},reason:"Nuevo sondeo"},"create")).rejects.toThrow("RIG_NOT_FOUND");
 });
 it("counts historical rigs for plan capacity and lets existing rigs receive configuration",async()=>{
  db.query.mockImplementation(async(sql:string)=>({rows:sql.includes("SELECT DISTINCT")?[{rig:"EX01",hole:null},{rig:"EX02",hole:null},{rig:"EX03",hole:null}]:[]}));
  await expect(saveCatalog({...manager,plan:"Básico"},{...rig,record:{code:"EX04"}},"create")).rejects.toThrow("MACHINE_LIMIT");
  await expect(saveCatalog({...manager,plan:"Básico"},rig,"create")).resolves.toMatchObject({revision:1});
 });
 it("preserves a restricted tariff omitted by a supervisor while auditing full stored value",async()=>{
  const payload={...rigCatalogSchema.parse({code:"EX01",hourlyCostUsd:99})};
  db.query.mockImplementation(async(sql:string)=>({rows:sql.includes("FOR UPDATE")?[{payload,revision:1}]:sql.startsWith("SELECT kind")?[{kind:"rig",payload,revision:1}]:[]}));
  await saveCatalog({...manager,role:"operations_supervisor"},{...rig,revision:1},"update");
  const write=db.query.mock.calls.find(([sql])=>sql.startsWith("INSERT INTO operational_catalog("));
  expect(JSON.parse(write?.[1][3]).hourlyCostUsd).toBe(99);
 });
 it("returns observed real codes without synthesizing goals or tariffs",async()=>{
  db.query.mockImplementation(async(sql:string)=>({rows:sql.includes("SELECT DISTINCT")?[{rig:"EX01",hole:"S1"}]:[]}));
  const catalog=await readCatalog({...manager,role:"client"});
  expect(catalog.holes[0]).toMatchObject({code:"S1",rigCode:"EX01",revision:0,source:"observed",targetDepthM:null,plannedMetersPerShift:null});
  expect(catalog.rigs[0]).not.toHaveProperty("hourlyCostUsd");
 });
});
