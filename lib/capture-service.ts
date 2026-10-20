import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrivateSession } from "./private-auth";
import { canWriteManualRecord, canAccessSection } from "./access-control";
import { tenantTransaction } from "./operational-db";
import type { OperationalShift, OperationalReport, CrownSnapshot } from "@/packages/import/types";

const text = z.string().trim().min(1).max(100);
const quantity = z.number().finite().min(0).max(1_000_000);
const optionalNumber = quantity.nullable().default(null);
export const captureSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d=new Date(`${v}T00:00:00Z`);return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v; }),
  rigCode: text, holeCode: text, shiftType: z.enum(["day", "night"]),
  startDepthM: quantity, endDepthM: quantity, diameter: text.nullable().default(null),
  activities: z.array(z.object({ label: text, hours: z.number().finite().min(0).max(12) }).strict()).min(1).max(40),
  parameters: z.object({ rpm: optionalNumber, torque: optionalNumber, pulldownPsi: optionalNumber, holdbackPsi: optionalNumber }).strict(),
  consumptions: z.array(z.object({ label: text, value: quantity, unit: text }).strict()).max(40).default([]),
  survey: z.array(z.object({ depthM: quantity, dip: z.number().finite().min(-90).max(90), azimuth: z.number().finite().min(0).lt(360), reference: text, equipment: text }).strict()).max(100).default([]),
  crown: z.object({ serial: text, type: text, brand: text.nullable().default(null) }).strict().nullable().default(null),
  reason: z.string().trim().min(5).max(300),
}).strict().superRefine((v, ctx) => {
  if(v.endDepthM < v.startDepthM) ctx.addIssue({code: "custom", message: "La profundidad final debe ser mayor o igual a la inicial"});
  if(Math.abs(v.activities.reduce((s,a)=>s+a.hours,0)-12)>0.001) ctx.addIssue({code: "custom", message: "Las actividades deben reconciliar 12 horas"});
  if(new Set(v.activities.map(a=>a.label.toLocaleUpperCase())).size!==v.activities.length) ctx.addIssue({code:"custom",message:"Actividad duplicada"});
  if(!v.activities.some(a=>a.label.toLocaleUpperCase()==="PERFORACIÓN")) ctx.addIssue({code:"custom",message:"Incluye PERFORACIÓN, incluso con cero horas"});
  if(v.endDepthM>v.startDepthM && !v.activities.some(a=>a.label.toLocaleUpperCase()==="PERFORACIÓN" && a.hours>0)) ctx.addIssue({code:"custom",message:"El avance requiere horas de perforación"});
});
export type CaptureInput = z.input<typeof captureSchema>;
export function canCapture(session: PrivateSession) { return !session.demo && canWriteManualRecord(session.role,session.plan,"shift"); }
export function prepareCapture(session: PrivateSession, raw: unknown) {
  if(!canCapture(session)) throw new Error("CAPTURE_DENIED");
  const input=captureSchema.parse(raw);
  if(input.crown && !canWriteManualRecord(session.role,session.plan,"crown")) throw new Error("CAPTURE_DENIED");
  if(input.survey.length && !canAccessSection({...session,section:"survey"})) throw new Error("CAPTURE_DENIED");
  const key=createHash("sha256").update(`${input.date}|${input.rigCode}|${input.shiftType}`).digest("hex");
  const source={file:"Captura online",fileSha256:createHash("sha256").update(JSON.stringify(input)).digest("hex"),sheet:input.rigCode,cells:{}};
  const crowns: CrownSnapshot[]=input.crown?[{key:`manual:${key}:${input.crown.serial}`,date:input.date,rigCode:input.rigCode,holeCode:input.holeCode,...input.crown,startDepthM:input.startDepthM,endDepthM:input.endDepthM,observedMetres:input.endDepthM-input.startDepthM,source:{...source,row:0},warnings:["MANUAL_CAPTURE: single crown explicitly attributed to shift"]}]:[];
  const payload: OperationalShift & {crowns:CrownSnapshot[]}={logicalKey:key,date:input.date,rigCode:input.rigCode,holeCode:input.holeCode,projectCode:null,shiftType:input.shiftType,granularity:"shift",startDepthM:input.startDepthM,endDepthM:input.endDepthM,advanceM:input.endDepthM-input.startDepthM,drillingHours:input.activities.find(a=>a.label.toLocaleUpperCase()==="PERFORACIÓN")!.hours,totalHours:12,diameter:input.diameter,activities:input.activities.map(a=>({...a,cell:"captura"})),parameters:{...input.parameters,torqueUnit:null},source,warnings:["MANUAL_CORRECTION: captured online; do not overwrite by import"],crowns};
  const report:OperationalReport={key:`manual:${key}`,date:input.date,rigCode:input.rigCode,holeCode:input.holeCode,source,survey:input.survey.map((s,i)=>({...s,key:`manual:${key}:survey:${i}`,valid:true,cells:{},warnings:["Referencia declarada por operador; no implica trayectoria validada"]})),consumptions:input.consumptions.map((c,i)=>({...c,key:`manual:${key}:consumption:${i}`,shiftType:input.shiftType,validity:"observed",cells:{},warnings:[]})),materials:[],equipmentHours:[],fluidParameters:[]};
  return {payload,report,reason:input.reason};
}
export async function captureShift(session:PrivateSession, raw:unknown) {
  const {payload,report,reason}=prepareCapture(session,raw);
  return tenantTransaction(session.tenantId,async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[session.tenantId]);
    const old=await client.query("SELECT logical_key FROM operational_shifts WHERE tenant_id=$1 AND (logical_key=$2 OR (payload->>'date'=$3 AND payload->>'rigCode'=$4 AND payload->>'shiftType'=$5))",[session.tenantId,payload.logicalKey,payload.date,payload.rigCode,payload.shiftType]);
    if(old.rows.length) throw new Error("SHIFT_EXISTS");
    await client.query("INSERT INTO operational_shifts(tenant_id,logical_key,payload) VALUES($1,$2,$3)",[session.tenantId,payload.logicalKey,JSON.stringify(payload)]);
    await client.query("INSERT INTO operational_revisions(tenant_id,logical_key,previous_payload,next_payload,reason,actor_id) VALUES($1,$2,NULL,$3,$4,$5)",[session.tenantId,payload.logicalKey,JSON.stringify(payload),reason,session.userId]);
    await client.query("INSERT INTO operational_reports(tenant_id,logical_key,payload,adapter_version) VALUES($1,$2,$3,'manual-v1')",[session.tenantId,report.key,JSON.stringify(report)]);
    await client.query("INSERT INTO operational_report_revisions(tenant_id,logical_key,previous_payload,next_payload,adapter_version,actor_id) VALUES($1,$2,NULL,$3,'manual-v1',$4)",[session.tenantId,report.key,JSON.stringify(report),session.userId]);
    return {ok:true,logicalKey:payload.logicalKey,revision:1};
  });
}
