import { privateSession } from "@/lib/private-auth";
import { canAccessSection } from "@/lib/access-control";
import { readOperation } from "@/lib/operational-store";
import { exportOperationalXlsx } from "@/lib/export-service";
export async function GET(request:Request){
  try{
    const session=await privateSession();if(!session)return Response.json({error:"No autorizado"},{status:401});
    if(!canAccessSection({...session,section:"reportes"}))return Response.json({error:"Exportación denegada"},{status:403});
    const p=new URL(request.url).searchParams;
    if(p.has("tenantId")&&p.get("tenantId")!==session.tenantId)return Response.json({error:"Empresa denegada"},{status:403});
    const data=await readOperation(session.tenantId,{from:p.get("from")||undefined,to:p.get("to")||undefined,rig:p.get("rig")||undefined,hole:p.get("hole")||undefined});
    if(!canAccessSection({...session,section:"coronas"}))data.crowns=[];
    // Export is an explicit allowlist: no personnel, decisions, signatures or tenant settings.
    const reports=(data as typeof data & {reports?:import("@/packages/import/types").OperationalReport[]}).reports;
    const scopedReports=reports?.map(r=>({...r,survey:canAccessSection({...session,section:"survey"})?r.survey:[],consumptions:canAccessSection({...session,section:"consumibles"})?r.consumptions:[],materials:canAccessSection({...session,section:"consumibles"})?r.materials:[]}));
    const bytes=await exportOperationalXlsx({...data,reports:scopedReports});
    return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":"attachment; filename=DrillOps-operacion.xlsx","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  }catch{return Response.json({error:"No se pudo exportar. No se usaron datos de demostración."},{status:503});}
}
