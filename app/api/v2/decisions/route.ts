import { z } from "zod";
import { privateSession,assertSameOrigin } from "@/lib/private-auth";
import { canAccessSection } from "@/lib/access-control";
import { tenantTransaction } from "@/lib/operational-db";
import { readOperation } from "@/lib/operational-store";
const schema=z.object({decision:z.enum(["accept","reject","alternative"]),reason:z.string().trim().min(5).max(1000),crownSerial:z.string().trim().min(1).max(100),filters:z.object({from:z.string().optional(),to:z.string().optional(),rig:z.string().optional(),hole:z.string().optional()})});
export async function POST(request:Request){
 try{
  assertSameOrigin(request);const session=await privateSession();if(!session)return Response.json({error:"No autorizado"},{status:401});
  if(session.demo)return Response.json({error:"Demo de sólo lectura"},{status:403});
  if(!canAccessSection({...session,section:"bit-advisor"}))return Response.json({error:"Decisión denegada"},{status:403});
  const parsed=schema.safeParse(await request.json());if(!parsed.success)return Response.json({error:"Razón y corona son obligatorias"},{status:400});
  const context=await readOperation(session.tenantId,parsed.data.filters);
  if(!context.crowns.some(c=>c.serial===parsed.data.crownSerial))return Response.json({error:"Corona fuera del contexto autorizado"},{status:400});
  const payload={...parsed.data,ruleVersion:"historical-review-v1",modelState:"NOT_VALIDATED",summary:context.summary,evidence:context.shifts.map(s=>({key:s.logicalKey,revision:s.revision})),actor:session.name};
  const result=await tenantTransaction(session.tenantId,c=>c.query("INSERT INTO operational_decisions(tenant_id,actor_id,payload) VALUES($1,$2,$3) RETURNING id,created_at",[session.tenantId,session.userId,JSON.stringify(payload)]));
  return Response.json(result.rows[0]);
 }catch{return Response.json({error:"No se pudo guardar la decisión"},{status:503});}
}
