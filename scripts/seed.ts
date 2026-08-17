import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../packages/db/client";
import { memberships, plans, tenants, users } from "../packages/db/schema";

async function main(){
  if(!db) throw new Error("DATABASE_URL es requerido");
  const database=db;
  const demo=process.env.DEMO_MODE!=="false";
  const tenantRows=await database.insert(tenants).values([
    {name:"Extract Services Demo",slug:"extract-services-demo",currency:"USD",settings:{AI_ENABLED:true,defaultInterval:3}},
    {name:"Cliente Minero Demo A",slug:"cliente-minero-demo-a",currency:"USD",settings:{AI_ENABLED:true}},
    {name:"Cliente Minero Demo B",slug:"cliente-minero-demo-b",currency:"USD",settings:{AI_ENABLED:false}},
  ]).onConflictDoNothing().returning();
  await database.insert(plans).values([
    {name:"Básico",monthlyPrice:"350",annualPrice:"4200",minimumCommitmentMonths:4,limits:{rigs:3,consumableCosts:false,disabledModules:["coronas","bit-advisor","survey","depth-intelligence","drill-assistant"]}},
    {name:"Intermedio",monthlyPrice:"450",annualPrice:"5400",minimumCommitmentMonths:6,limits:{rigs:6,consumableCosts:false,disabledModules:["depth-intelligence","drill-assistant"]}},
    {name:"Premium",monthlyPrice:"600",annualPrice:"7200",minimumCommitmentMonths:12,limits:{rigs:-1,consumableCosts:true,disabledModules:[]}},
  ]).onConflictDoNothing();
  if(!demo){console.log("Seed base completado; credenciales demo omitidas.");return}
  const tenantBySlug=Object.fromEntries(await Promise.all(["extract-services-demo","cliente-minero-demo-a","cliente-minero-demo-b"].map(async slug=>{const tenant=tenantRows.find(row=>row.slug===slug)??(await database.select().from(tenants).where(eq(tenants.slug,slug)))[0];return [slug,tenant]})));
  const passwordHash=await bcrypt.hash("DrillOps2026!",12);
  const demoUsers=[
    {email:"platform@demo.local",name:"Andrea Plataforma",platformAdmin:true,role:"platform_admin" as const,tenantSlug:"extract-services-demo"},
    {email:"gerencia@extract.demo",name:"Carlos Mendoza",platformAdmin:false,role:"general_manager" as const,tenantSlug:"extract-services-demo"},
    {email:"cliente@extract.demo",name:"María Cliente",platformAdmin:false,role:"client" as const,tenantSlug:"extract-services-demo"},
    {email:"supervisor@extract.demo",name:"Raúl Supervisor",platformAdmin:false,role:"operations_supervisor" as const,tenantSlug:"extract-services-demo"},
    {email:"perforador@extract.demo",name:"Miguel Perforador",platformAdmin:false,role:"driller" as const,tenantSlug:"extract-services-demo"},
    {email:"control@extract.demo",name:"Elena Control",platformAdmin:false,role:"control" as const,tenantSlug:"extract-services-demo"},
    {email:"basico@minera-a.demo",name:"Gerencia Plan Básico",platformAdmin:false,role:"general_manager" as const,tenantSlug:"cliente-minero-demo-a"},
    {email:"intermedio@minera-b.demo",name:"Gerencia Plan Intermedio",platformAdmin:false,role:"general_manager" as const,tenantSlug:"cliente-minero-demo-b"},
  ];
  for(const demoUser of demoUsers){const [user]=await database.insert(users).values({email:demoUser.email,name:demoUser.name,passwordHash,platformAdmin:demoUser.platformAdmin}).onConflictDoNothing().returning();const tenant=tenantBySlug[demoUser.tenantSlug];if(user&&tenant)await database.insert(memberships).values({tenantId:tenant.id,userId:user.id,role:demoUser.role}).onConflictDoNothing()}
  console.log("Seed demo completado.");
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error instanceof Error?error.message:error);process.exit(1)});
