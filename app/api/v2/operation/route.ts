import { privateSession, assertSameOrigin } from "@/lib/private-auth";
import { canAccessSection } from "@/lib/access-control";
import { correctShift, readOperation } from "@/lib/operational-store";
import { z } from "zod";
export async function GET(request:Request) {
  try {
    const session=await privateSession();if(!session)return Response.json({error:"No autorizado"},{status:401});
    if(!canAccessSection({...session,section:"operacion"}))return Response.json({error:"Perfil sin acceso operacional"},{status:403});
    const params=new URL(request.url).searchParams;
    if(params.has("tenantId")&&params.get("tenantId")!==session.tenantId)return Response.json({error:"Empresa denegada"},{status:403});
    const data=await readOperation(session.tenantId,{from:params.get("from")??undefined,to:params.get("to")??undefined,rig:params.get("rig")??undefined,hole:params.get("hole")??undefined});
    const crownAccess=canAccessSection({...session,section:"coronas"});
    if(!crownAccess){data.crowns=[];data.shifts=data.shifts.map(s=>({...s,crowns:[]}));}
    if(!canAccessSection({...session,section:"bit-advisor"}))data.decisions=[];
    return Response.json(data,{headers:{"Cache-Control":"private, no-store"}});
  }catch{return Response.json({error:"Datos no disponibles. No se utilizan datos de demostración."},{status:503});}
}
const correction=z.object({logicalKey:z.string().max(128),revision:z.number().int().positive(),advanceM:z.number().finite().min(0).max(1000),drillingHours:z.number().finite().min(0).max(12),reason:z.string().trim().min(5).max(500)});
export async function PATCH(request:Request) {
  try {
    assertSameOrigin(request);
    const session=await privateSession();if(!session)return Response.json({error:"No autorizado"},{status:401});
    if(session.demo)return Response.json({error:"Demo de sólo lectura"},{status:403});
    if(!["general_manager","operations_supervisor","platform_admin"].includes(session.role))return Response.json({error:"Corrección denegada"},{status:403});
    const parsed=correction.safeParse(await request.json());if(!parsed.success)return Response.json({error:"Corrección inválida"},{status:400});
    return Response.json(await correctShift(session,parsed.data));
  }catch(e){const message=e instanceof Error?e.message:"";return Response.json({error:message==="REVISION_CONFLICT"?"Otro usuario cambió el turno. Recarga.":"No se pudo corregir el turno"},{status:message==="REVISION_CONFLICT"?409:message==="NOT_FOUND"?404:503});}
}
