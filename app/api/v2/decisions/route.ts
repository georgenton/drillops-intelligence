import { z } from "zod";
import { privateSession,assertSameOrigin } from "@/lib/private-auth";
import { canRecordDecision,saveDecision } from "@/lib/decision-service";
export async function POST(request:Request){
 try{
  assertSameOrigin(request);const session=await privateSession();if(!session)return Response.json({error:"No autorizado"},{status:401});
  if(session.demo)return Response.json({error:"Demo de sólo lectura"},{status:403});
  if(!canRecordDecision(session))return Response.json({error:"Decisión denegada"},{status:403});
  return Response.json(await saveDecision(session,await request.json()));
 }catch(error){
  if(error instanceof z.ZodError || error instanceof SyntaxError)return Response.json({error:"Revisa razón, corona, filtros y supuestos del escenario"},{status:400});
  const code=error instanceof Error?error.message:"";
  if(code==="CROWN_OUTSIDE_CONTEXT")return Response.json({error:"Corona fuera del contexto autorizado"},{status:400});
  if(code==="DECISION_DENIED"||code==="ORIGIN_DENIED")return Response.json({error:"Decisión denegada"},{status:403});
  return Response.json({error:"No se pudo guardar la decisión"},{status:503});
 }
}
