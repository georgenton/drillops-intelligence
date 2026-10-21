import type {PrivateSession} from "./private-auth";
import {tenantTransaction} from "./operational-db";
import {canAccessSection,canWriteManualRecord,type AppSection} from "./access-control";
import type {ManualRecordKind} from "./manual-records";
import {quickRecordSchema,type QuickRecordInput,type QuickRecordKind,type StoredQuickRecord} from "@/packages/domain/quick-operation-records";
import type {OperationalShift} from "@/packages/import/types";
import type {PoolClient} from "pg";
const permission:Record<QuickRecordKind,{section:AppSection;write:ManualRecordKind}>={
 interval:{section:"intervalos",write:"interval"},event:{section:"operacion",write:"shift"},
 crown_change:{section:"coronas",write:"crown"},consumption:{section:"consumibles",write:"consumable"},
};
export function canWriteQuickRecord(session:PrivateSession,kind:QuickRecordKind){
 return !session.demo&&canWriteManualRecord(session.role,session.plan,permission[kind].write)&&canAccessSection({...session,section:permission[kind].section});
}
export function validateQuickRecordAgainstShift(input:QuickRecordInput,shift:OperationalShift){
 if(input.kind==="interval"||input.kind==="crown_change"){
  if(typeof shift.startDepthM!=="number"||typeof shift.endDepthM!=="number"||!Number.isFinite(shift.startDepthM)||!Number.isFinite(shift.endDepthM))throw new Error("DEPTH_BOUNDS_REQUIRED");
  const from=input.kind==="interval"?input.record.startDepthM:input.record.depthM;
  const to=input.kind==="interval"?input.record.endDepthM:input.record.depthM;
  if(from<shift.startDepthM||to>shift.endDepthM)throw new Error("OUTSIDE_SHIFT");
 }
 if(input.kind==="interval"&&shift.drillingHours!==null&&input.record.minutes>shift.drillingHours*60+1e-6)throw new Error("DURATION_EXCEEDS_SHIFT");
 if(input.kind==="event"&&shift.totalHours!==null&&input.record.hours>shift.totalHours)throw new Error("DURATION_EXCEEDS_SHIFT");
}
export async function readQuickRecordsWithClient(client:PoolClient,tenantId:string,logicalKey?:string):Promise<StoredQuickRecord[]>{
 return (await client.query<StoredQuickRecord>(`SELECT id,kind,logical_key AS "logicalKey",payload,created_at AS "createdAt"
   FROM operational_quick_records WHERE tenant_id=$1 AND ($2::text IS NULL OR logical_key=$2) ORDER BY created_at DESC`,[tenantId,logicalKey??null])).rows;
}
export function redactQuickRecords(records:StoredQuickRecord[],session:PrivateSession){
 const kinds=(Object.keys(permission) as QuickRecordKind[]).filter(kind=>canAccessSection({...session,section:permission[kind].section}));
 return records.filter(record=>kinds.includes(record.kind));
}
export async function readQuickRecords(session:PrivateSession,logicalKey?:string):Promise<StoredQuickRecord[]>{
 return tenantTransaction(session.tenantId,async client=>redactQuickRecords(await readQuickRecordsWithClient(client,session.tenantId,logicalKey),session));
}
export async function saveQuickRecord(session:PrivateSession,raw:unknown){
 if(!(Object.keys(permission) as QuickRecordKind[]).some(kind=>canWriteQuickRecord(session,kind)))throw new Error("FORBIDDEN");
 const input=quickRecordSchema.parse(raw);
 if(!canWriteQuickRecord(session,input.kind))throw new Error("FORBIDDEN");
 return tenantTransaction(session.tenantId,async client=>{
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`${session.tenantId}|quick|${input.requestId}`]);
  const prior=await client.query(`SELECT id,logical_key,kind,reason,shift_revision,payload=$3::jsonb AS same FROM operational_quick_records WHERE tenant_id=$1 AND request_id=$2`,[session.tenantId,input.requestId,JSON.stringify(input.record)]);
  if(prior.rows.length){
   const old=prior.rows[0];
   if(old.same&&old.logical_key===input.logicalKey&&old.kind===input.kind&&old.reason===input.reason&&old.shift_revision===input.shiftRevision)return {ok:true,id:old.id,duplicate:true};
   throw new Error("REQUEST_CONFLICT");
  }
  const row=await client.query<{payload:OperationalShift;revision:number}>("SELECT payload,revision FROM operational_shifts WHERE tenant_id=$1 AND logical_key=$2 FOR UPDATE",[session.tenantId,input.logicalKey]);
  if(!row.rows.length)throw new Error("SHIFT_NOT_FOUND");
  if(row.rows[0].revision!==input.shiftRevision)throw new Error("REVISION_CONFLICT");
  validateQuickRecordAgainstShift(input,row.rows[0].payload);
  if(input.kind==="interval"){
   const overlaps=await client.query(`SELECT id FROM operational_quick_records WHERE tenant_id=$1 AND logical_key=$2 AND kind='interval'
    AND (payload->>'startDepthM')::numeric<$4 AND (payload->>'endDepthM')::numeric>$3 LIMIT 1`,[session.tenantId,input.logicalKey,input.record.startDepthM,input.record.endDepthM]);
   if(overlaps.rowCount)throw new Error("INTERVAL_OVERLAP");
   if(row.rows[0].payload.drillingHours!==null){
    const duration=await client.query("SELECT COALESCE(sum((payload->>'minutes')::numeric),0) AS minutes FROM operational_quick_records WHERE tenant_id=$1 AND logical_key=$2 AND kind='interval'",[session.tenantId,input.logicalKey]);
    if(Number(duration.rows[0]?.minutes??0)+input.record.minutes>row.rows[0].payload.drillingHours*60+1e-6)throw new Error("DURATION_EXCEEDS_SHIFT");
   }
  }
  const result=await client.query("INSERT INTO operational_quick_records(tenant_id,logical_key,request_id,kind,payload,shift_revision,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
   [session.tenantId,input.logicalKey,input.requestId,input.kind,JSON.stringify(input.record),input.shiftRevision,input.reason,session.userId]);
  return {ok:true,id:result.rows[0].id,duplicate:false};
 });
}
