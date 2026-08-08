import crypto from "node:crypto";

export type DemoSession = { email: string; name: string; role: "platform_admin"|"tenant_owner"|"supervisor"|"operator"; tenantId: "extract"|"minera-a"|"minera-b"; exp: number };
const secret = () => process.env.AUTH_SECRET || "drillops-demo-only-secret-change-in-production";

export function signSession(payload: Omit<DemoSession,"exp">): string {
  const data = Buffer.from(JSON.stringify({ ...payload, exp: Date.now()+8*60*60*1000 })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifySession(token?: string): DemoSession | null {
  if (!token) return null;
  const [data,sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = crypto.createHmac("sha256", secret()).update(data).digest("base64url");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const session = JSON.parse(Buffer.from(data,"base64url").toString()) as DemoSession;
  return session.exp > Date.now() ? session : null;
}
