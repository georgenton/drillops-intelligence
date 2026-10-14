import { NextResponse } from "next/server";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { operationalPool } from "@/lib/operational-db";
import { assertSameOrigin, sessionHash } from "@/lib/private-auth";
import { isCommerciallyClosed, isDemoMode } from "@/lib/runtime-mode";
const credentials = z.object({ email: z.string().email().max(254), password: z.string().min(8).max(128) });
export async function POST(request: Request) {
  if (isCommerciallyClosed() || isDemoMode()) return NextResponse.json({error:"Acceso privado cerrado"},{status:403});
  try { assertSameOrigin(request); } catch { return NextResponse.json({error:"Origen denegado"},{status:403}); }
  const parsed = credentials.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return NextResponse.json({error:"Credenciales inválidas"},{status:400});
  try {
    const db = operationalPool();
    const email = parsed.data.email.toLowerCase().trim();
    const identity = sessionHash(email);
    const attempt = await db.query(`INSERT INTO operational_login_attempts(identity_hash,attempts) VALUES($1,1)
      ON CONFLICT(identity_hash) DO UPDATE SET attempts=CASE WHEN operational_login_attempts.window_start < now()-interval '15 minutes' THEN 1 ELSE operational_login_attempts.attempts+1 END,
      window_start=CASE WHEN operational_login_attempts.window_start < now()-interval '15 minutes' THEN now() ELSE operational_login_attempts.window_start END RETURNING attempts`,[identity]);
    if (attempt.rows[0].attempts > 10) return NextResponse.json({error:"Demasiados intentos. Intenta en 15 minutos."},{status:429});
    const users = await db.query(`SELECT u.id,u.password_hash,m.tenant_id FROM users u JOIN memberships m ON m.user_id=u.id JOIN tenants t ON t.id=m.tenant_id WHERE lower(u.email)=$1 AND t.active=true ORDER BY m.created_at LIMIT 2`,[email]);
    // Individual account has exactly one active tenant; ambiguous accounts fail closed.
    const user = users.rows.length === 1 ? users.rows[0] : null;
    const valid = await bcrypt.compare(parsed.data.password, user?.password_hash ?? "$2b$12$C6UzMDM.H6dfI/f/IKcEe.1jzGHVrWGNXMX0pEJ7cuyP8Nnq.Vh4e");
    if (!user || !valid) return NextResponse.json({error:"Credenciales inválidas"},{status:401});
    const token = crypto.randomBytes(32).toString("hex");
    await db.query("INSERT INTO operational_sessions(token_hash,user_id,tenant_id,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')",[sessionHash(token),user.id,user.tenant_id]);
    const response=NextResponse.json({ok:true,landing:"dashboard"});
    response.cookies.set("drillops_private_session",token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:28800});
    return response;
  } catch { return NextResponse.json({error:"Servicio de autenticación no disponible"},{status:503}); }
}
export async function DELETE(request: Request) {
  try { assertSameOrigin(request); } catch { return NextResponse.json({error:"Origen denegado"},{status:403}); }
  const {cookies}=await import("next/headers");
  const token=(await cookies()).get("drillops_private_session")?.value;
  if(token) {
    try { await operationalPool().query("UPDATE operational_sessions SET revoked_at=now() WHERE token_hash=$1",[sessionHash(token)]); }
    catch { return NextResponse.json({error:"No se pudo revocar la sesión"},{status:503}); }
  }
  const response=NextResponse.json({ok:true});response.cookies.delete("drillops_private_session");return response;
}
