import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../packages/db/client";
import { memberships, plans, tenants, users } from "../packages/db/schema";

async function main(){
  if(!db) throw new Error("DATABASE_URL es requerido");
  const demo=process.env.DEMO_MODE!=="false";
  const tenantRows=await db.insert(tenants).values([
    {name:"Extract Services Demo",slug:"extract-services-demo",currency:"USD",settings:{AI_ENABLED:true,defaultInterval:3}},
    {name:"Cliente Minero Demo A",slug:"cliente-minero-demo-a",currency:"USD",settings:{AI_ENABLED:true}},
    {name:"Cliente Minero Demo B",slug:"cliente-minero-demo-b",currency:"USD",settings:{AI_ENABLED:false}},
  ]).onConflictDoNothing().returning();
  await db.insert(plans).values([
    {name:"Starter",monthlyPrice:"249",annualPrice:"2388",limits:{users:5,rigs:2,projects:3,aiQueries:100}},
    {name:"Professional",monthlyPrice:"599",annualPrice:"5748",limits:{users:25,rigs:10,projects:-1,aiQueries:1000}},
    {name:"Enterprise",monthlyPrice:"0",annualPrice:"0",limits:{users:-1,rigs:-1,projects:-1,aiQueries:-1}},
  ]).onConflictDoNothing();
  if(!demo){console.log("Seed base completado; credenciales demo omitidas.");return}
  const extract=tenantRows.find(t=>t.slug==="extract-services-demo")??(await db.select().from(tenants).where(eq(tenants.slug,"extract-services-demo")))[0];
  const passwordHash=await bcrypt.hash("DrillOps2026!",12);
  const demoUsers=[
    {email:"platform@demo.local",name:"Andrea Plataforma",platformAdmin:true,role:"platform_admin" as const},
    {email:"owner@extract.demo",name:"Carlos Mendoza",platformAdmin:false,role:"tenant_owner" as const},
    {email:"supervisor@extract.demo",name:"Raúl Supervisor",platformAdmin:false,role:"supervisor" as const},
    {email:"operator@extract.demo",name:"Miguel Operador",platformAdmin:false,role:"operator" as const},
  ];
  for(const demoUser of demoUsers){const [user]=await db.insert(users).values({email:demoUser.email,name:demoUser.name,passwordHash,platformAdmin:demoUser.platformAdmin}).onConflictDoNothing().returning();if(user&&extract)await db.insert(memberships).values({tenantId:extract.id,userId:user.id,role:demoUser.role}).onConflictDoNothing()}
  console.log("Seed demo completado.");
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error instanceof Error?error.message:error);process.exit(1)});
