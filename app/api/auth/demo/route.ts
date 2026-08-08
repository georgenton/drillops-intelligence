import { NextResponse } from "next/server";
import { z } from "zod";
import { signSession } from "@/lib/auth";

const schema = z.object({ email:z.string().email(), password:z.string().min(8) });
const users = {
  "platform@demo.local": { name:"Andrea Plataforma", role:"platform_admin", tenantId:"extract" },
  "owner@extract.demo": { name:"Carlos Mendoza", role:"tenant_owner", tenantId:"extract" },
  "supervisor@extract.demo": { name:"Raúl Supervisor", role:"supervisor", tenantId:"extract" },
  "operator@extract.demo": { name:"Miguel Operador", role:"operator", tenantId:"extract" },
} as const;

export async function POST(request: Request) {
  if (process.env.DEMO_MODE === "false") return NextResponse.json({error:"Acceso demo deshabilitado"},{status:403});
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success || parsed.data.password !== "DrillOps2026!" || !(parsed.data.email in users)) return NextResponse.json({error:"Credenciales inválidas"},{status:401});
  const email = parsed.data.email as keyof typeof users;
  const token = signSession({ email, ...users[email] });
  const response = NextResponse.json({ ok:true });
  response.cookies.set("drillops_session",token,{httpOnly:true,sameSite:"strict",secure:process.env.NODE_ENV==="production",path:"/",maxAge:8*60*60});
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ok:true});
  response.cookies.delete("drillops_session");
  return response;
}
