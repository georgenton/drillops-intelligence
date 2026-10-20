import {privateSession} from "@/lib/private-auth";
import {readReviewScenario} from "@/lib/review-scenario";
import {reviewCsv,reviewHtml} from "@/lib/review-report";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
export async function GET(request:Request){
 try{
  const session=await privateSession();if(!session)return Response.json({error:"No autorizado"},{status:401,headers});
  const params=new URL(request.url).searchParams;
  if(params.has("tenantId")&&params.get("tenantId")!==session.tenantId)return Response.json({error:"Empresa denegada"},{status:403,headers});
  const scenario=await readReviewScenario(session);
  if(!scenario)return Response.json({error:"Escenario no habilitado para esta empresa"},{status:404,headers});
  if(params.get("format")==="json")return Response.json(scenario,{headers:{...headers,"Content-Disposition":"attachment; filename=DrillOps-datos-y-supuestos.json"}});
  if(params.get("format")==="csv")return new Response(reviewCsv(scenario),{headers:{...headers,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=DrillOps-datos-y-supuestos.csv"}});
  return new Response(reviewHtml(scenario),{headers:{...headers,"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'"}});
 }catch{return Response.json({error:"Informe no disponible; no se sustituyó por otro escenario"},{status:503,headers});}
}
