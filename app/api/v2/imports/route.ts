import { privateSession,assertSameOrigin } from "@/lib/private-auth";
import { canAccessSection } from "@/lib/access-control";
import { parseOperationalArchive } from "@/packages/import/may-2026";
import { commitImport } from "@/lib/operational-store";
import { operationalPool } from "@/lib/operational-db";
import { sessionHash } from "@/lib/private-auth";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(request:Request){
 try{
  assertSameOrigin(request);
  const session=await privateSession();if(!session)return Response.json({error:"No autorizado"},{status:401});
  if(session.demo)return Response.json({error:"Demo de sólo lectura"},{status:403});
  if(!canAccessSection({...session,section:"importaciones"}))return Response.json({error:"Importación denegada"},{status:403});
  const attempt=await operationalPool().query(`INSERT INTO operational_login_attempts(identity_hash,attempts) VALUES($1,1)
    ON CONFLICT(identity_hash) DO UPDATE SET attempts=CASE WHEN operational_login_attempts.window_start<now()-interval '1 minute' THEN 1 ELSE operational_login_attempts.attempts+1 END,
    window_start=CASE WHEN operational_login_attempts.window_start<now()-interval '1 minute' THEN now() ELSE operational_login_attempts.window_start END RETURNING attempts`,[sessionHash(`import:${session.userId}`)]);
  if(attempt.rows[0].attempts>6)return Response.json({error:"Límite de importaciones: espera un minuto"},{status:429});
  const max=12*1024*1024;
  if(Number(request.headers.get("content-length")??0)>max)return Response.json({error:"ZIP demasiado grande"},{status:413});
  const reader=request.body?.getReader();if(!reader)return Response.json({error:"Archivo requerido"},{status:400});
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>max){await reader.cancel();return Response.json({error:"ZIP demasiado grande"},{status:413});}chunks.push(chunk.value);}
  const parsed=parseOperationalArchive(Buffer.concat(chunks));
  if(new URL(request.url).searchParams.get("commit")!=="true")return Response.json({summary:parsed.summary,issues:parsed.issues,hash:parsed.archiveSha256,adapterVersion:parsed.adapterVersion});
  const expected=request.headers.get("x-preview-hash");
  if(expected!==parsed.archiveSha256)return Response.json({error:"Revisa la vista previa del mismo archivo antes de confirmar"},{status:409});
  return Response.json(await commitImport(session,parsed));
 }catch(e){const message=e instanceof Error?e.message:"";return Response.json({error:message==="MANUAL_CORRECTION_CONFLICT"?"El archivo intenta reemplazar una corrección manual. Revisión explícita necesaria; importación revertida.":message==="IMPORT_VALIDATION_FAILED"?"Corrige los errores de validación antes de importar":"No se pudo procesar la importación; verifica formato, límites y disponibilidad."},{status:message==="MANUAL_CORRECTION_CONFLICT"?409:422});}
}
