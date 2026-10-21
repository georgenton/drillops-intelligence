import { privateSession } from "@/lib/private-auth";
import { readReviewScenario } from "@/lib/review-scenario";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
export async function GET(request:Request){
  try{
    const session=await privateSession();
    if(!session)return Response.json({error:"No autorizado"},{status:401,headers});
    const p=new URL(request.url).searchParams;
    if(p.has("tenantId")&&p.get("tenantId")!==session.tenantId)return Response.json({error:"Empresa denegada"},{status:403,headers});
    return Response.json({scenario:await readReviewScenario(session)},{headers});
  }catch{return Response.json({error:"No se pudo cargar el escenario de revisión."},{status:503,headers});}
}
