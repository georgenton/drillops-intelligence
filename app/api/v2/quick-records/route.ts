import {z} from "zod";
import {assertSameOrigin,privateSession} from "@/lib/private-auth";
import {readQuickRecords,saveQuickRecord} from "@/lib/quick-operation-records";
const headers={"Cache-Control":"private, no-store"};
export async function GET(request:Request){
 try{
  const session=await privateSession();if(!session)return Response.json({error:"No autorizado"},{status:401,headers});
  const params=new URL(request.url).searchParams;
  if(params.has("tenantId")&&params.get("tenantId")!==session.tenantId)return Response.json({error:"Empresa denegada"},{status:403,headers});
  return Response.json({records:await readQuickRecords(session,params.get("logicalKey")??undefined)},{headers});
 }catch{return Response.json({error:"Detalle no disponible"},{status:503,headers});}
}
export async function POST(request:Request){
 try{
  assertSameOrigin(request);const session=await privateSession();
  if(!session)return Response.json({error:"No autorizado"},{status:401,headers});
  const text=await request.text();if(text.length>10_000)return Response.json({error:"Registro demasiado grande"},{status:413,headers});
  return Response.json(await saveQuickRecord(session,JSON.parse(text)),{status:201,headers});
 }catch(error){
  const code=error instanceof Error?error.message:"";
  const status=error instanceof z.ZodError||error instanceof SyntaxError?400:["FORBIDDEN","ORIGIN_DENIED"].includes(code)?403:
   ["REVISION_CONFLICT","REQUEST_CONFLICT","INTERVAL_OVERLAP"].includes(code)?409:code==="SHIFT_NOT_FOUND"?404:
   ["DEPTH_BOUNDS_REQUIRED","OUTSIDE_SHIFT","DURATION_EXCEEDS_SHIFT"].includes(code)?422:503;
  const messages:Record<string,string>={
   REVISION_CONFLICT:"El turno cambió. Recarga antes de registrar el detalle.",REQUEST_CONFLICT:"La solicitud ya existe con otro contenido.",
   INTERVAL_OVERLAP:"El intervalo se superpone a otro detalle del turno.",SHIFT_NOT_FOUND:"Turno no encontrado en esta empresa.",
   DEPTH_BOUNDS_REQUIRED:"El turno necesita profundidades válidas antes de registrar este detalle.",OUTSIDE_SHIFT:"La profundidad debe estar dentro del turno.",
   DURATION_EXCEEDS_SHIFT:"La duración supera las horas declaradas del turno.",
  };
  return Response.json({error:messages[code]??(status===403?"Registro denegado":status===400?"Registro inválido":"No se guardó el detalle"),code:status===503?"UNAVAILABLE":status===400?"INVALID_INPUT":code},{status,headers});
 }
}
