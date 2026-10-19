import crypto from "node:crypto";
import { cookies } from "next/headers";
import { operationalPool } from "./operational-db";
import { isCommerciallyClosed,isDemoMode } from "./runtime-mode";
import { verifySession } from "./auth";
import type { AppRole } from "./access-control";
export type PrivateSession = { userId: string; tenantId: string; email: string; name: string; role: AppRole; plan: "Básico" | "Intermedio" | "Premium"; demo?:boolean };
export const sessionHash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
export async function privateSession(): Promise<PrivateSession | null> {
  if (isCommerciallyClosed()) return null;
  if(isDemoMode()) {
    if(!verifySession((await cookies()).get("drillops_session")?.value))return null;
    const result=await operationalPool().query<PrivateSession>(`SELECT u.id AS "userId",t.id AS "tenantId",u.email,u.name,'operations_supervisor' AS role,'Premium' AS plan FROM tenants t JOIN memberships m ON m.tenant_id=t.id JOIN users u ON u.id=m.user_id WHERE t.slug='synthetic-demo' AND t.active=true LIMIT 1`);
    return result.rows[0]?{...result.rows[0],demo:true}:null;
  }
  const token = (await cookies()).get("drillops_private_session")?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const result = await operationalPool().query<PrivateSession>(`
    SELECT u.id AS "userId", t.id AS "tenantId",u.email,u.name,
      CASE WHEN $2='staging' AND m.role::text='client'
        AND COALESCE(t.settings->'operationalReviewMembershipIds','[]'::jsonb) ? m.id::text
        THEN 'operational_reviewer' ELSE m.role::text END AS role,
      COALESCE(t.settings->>'plan','Premium') AS plan
    FROM operational_sessions s JOIN users u ON u.id=s.user_id
    JOIN memberships m ON m.user_id=u.id AND m.tenant_id=s.tenant_id
    JOIN tenants t ON t.id=m.tenant_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NULL AND t.active=true`, [sessionHash(token), process.env.DRILLOPS_ENV ?? ""]);
  return result.rows[0] ?? null;
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Server-only runtime configuration: NEXT_PUBLIC_* is frozen during image build.
  const expected=new URL(process.env.APP_ORIGIN??request.url).origin;
  if (!origin || origin !== expected) throw new Error("ORIGIN_DENIED");
}
