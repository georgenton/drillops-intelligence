import { assertSameOrigin, privateSession } from "@/lib/private-auth";
import { canAccessSection } from "@/lib/access-control";
import { readCatalog, saveCatalog } from "@/lib/operational-catalog";
import { ZodError } from "zod";

const headers={"Cache-Control":"private, no-store"};
export async function GET(request:Request) {
  try {
    const session=await privateSession();
    if(!session)return Response.json({error:"No autorizado"},{status:401,headers});
    if(!["sondeos","taladros"].some(section=>canAccessSection({...session,section:section as "sondeos"|"taladros"})))return Response.json({error:"Acceso denegado"},{status:403,headers});
    const tenant=new URL(request.url).searchParams.get("tenantId");
    if(tenant&&tenant!==session.tenantId)return Response.json({error:"Empresa denegada"},{status:403,headers});
    return Response.json(await readCatalog(session),{headers});
  }catch{return Response.json({error:"Catálogo no disponible"},{status:503,headers});}
}
async function write(request:Request,mode:"create"|"update"){
  try{
    assertSameOrigin(request);
    const session=await privateSession();
    if(!session)return Response.json({error:"No autorizado"},{status:401,headers});
    return Response.json(await saveCatalog(session,await request.json(),mode),{status:mode==="create"?201:200,headers});
  }catch(error){
    const code=error instanceof Error?error.message:"";
    const status=error instanceof ZodError||error instanceof SyntaxError||["REVISION_REQUIRED","INVALID_CREATE_REVISION"].includes(code)?400:
      ["FORBIDDEN","COST_FORBIDDEN","ORIGIN_DENIED"].includes(code)?403:
      ["REVISION_CONFLICT","ALREADY_EXISTS","MACHINE_LIMIT"].includes(code)?409:
      ["NOT_FOUND","RIG_NOT_FOUND"].includes(code)?404:503;
    const messages:Record<string,string>={REVISION_CONFLICT:"Otro usuario cambió el registro. Recarga antes de corregir.",ALREADY_EXISTS:"El código ya existe en esta empresa.",MACHINE_LIMIT:"Límite de máquinas del plan alcanzado.",RIG_NOT_FOUND:"El taladro debe existir en esta empresa.",COST_FORBIDDEN:"No tienes permiso para configurar tarifas."};
    return Response.json({error:messages[code]??(status===400?"Registro inválido":status===403?"Acción denegada":"No se pudo guardar el catálogo"),code:status===503?"UNAVAILABLE":status===400?"INVALID_INPUT":code},{status,headers});
  }
}
export const POST=(request:Request)=>write(request,"create");
export const PATCH=(request:Request)=>write(request,"update");
