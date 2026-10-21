import { createHash } from "node:crypto";
import { z } from "zod";
import { tenantTransaction } from "./operational-db";
import type { PrivateSession } from "./private-auth";
import { canAccessSection, canWriteManualRecord } from "./access-control";
import { validateAttachment, type ReportAttachment } from "@/packages/domain/private-attachment";
type Session=Pick<PrivateSession,"tenantId"|"userId"|"role"|"plan"|"demo">;
export const canWriteAttachment=(s:Session)=>!s.demo&&canAccessSection({...s,section:"reportes"})&&canWriteManualRecord(s.role,s.plan,"report_attachment");
const assertRead=(s:Session)=>{if(!canAccessSection({...s,section:"reportes"}))throw Error("FORBIDDEN");};
const reportKeySchema=z.string().trim().min(1).max(500);
const fields=`id,report_key AS "reportKey",name,mime,size,reason,created_at AS "createdAt"`;
export async function readAttachments(s:Session,key:string){
  assertRead(s);const reportKey=reportKeySchema.parse(key);
  return tenantTransaction(s.tenantId,async client=>{
    const rows=await client.query<ReportAttachment>(`SELECT ${fields} FROM operational_report_attachments WHERE tenant_id=$1 AND report_key=$2 ORDER BY created_at,id`,[s.tenantId,reportKey]);
    return {attachments:rows.rows,canWrite:canWriteAttachment(s)};
  });
}
export async function saveAttachment(s:Session,input:{reportKey:string;reason:string;name:string;mime:string;bytes:Uint8Array}){
  if(!canWriteAttachment(s))throw Error("FORBIDDEN");
  const reportKey=reportKeySchema.parse(input.reportKey),reason=z.string().trim().min(5).max(500).parse(input.reason);
  const file=validateAttachment(input.bytes,input.mime,input.name);
  return tenantTransaction(s.tenantId,async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`${s.tenantId}|attachments`]);
    const report=await client.query("SELECT 1 FROM operational_reports WHERE tenant_id=$1 AND logical_key=$2",[s.tenantId,reportKey]);
    if(!report.rowCount)throw Error("NOT_FOUND");
    const total=await client.query<{bytes:string}>("SELECT COALESCE(sum(size),0) AS bytes FROM operational_report_attachments WHERE tenant_id=$1",[s.tenantId]);
    if(Number(total.rows[0].bytes)+file.size>100*1024*1024)throw Error("ATTACHMENT_QUOTA");
    const result=await client.query<{id:string}>(`INSERT INTO operational_report_attachments(tenant_id,report_key,name,mime,size,content,sha256,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [s.tenantId,reportKey,file.name,file.mime,file.size,Buffer.from(input.bytes),createHash("sha256").update(input.bytes).digest("hex"),reason,s.userId]);
    return {ok:true,id:result.rows[0].id};
  });
}
export async function readAttachmentBytes(s:Session,id:string){
  assertRead(s);z.string().uuid().parse(id);
  return tenantTransaction(s.tenantId,async client=>{
    const result=await client.query<ReportAttachment&{content:Buffer}>(`SELECT ${fields},content FROM operational_report_attachments WHERE tenant_id=$1 AND id=$2`,[s.tenantId,id]);
    if(!result.rows[0])throw Error("NOT_FOUND");
    return result.rows[0];
  });
}
