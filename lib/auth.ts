import crypto from "node:crypto";
import { canonicalRoles, type SessionRole } from "@/lib/access-control";

export type DemoSession = { email: string; name: string; role: SessionRole; tenantId: "extract"|"minera-a"|"minera-b"; exp: number };
const legacyRoles = ["tenant_owner","admin","supervisor","operator","viewer"] as const;
const validRoles = new Set<string>([...canonicalRoles,...legacyRoles]);
const validTenants = new Set<DemoSession["tenantId"]>(["extract","minera-a","minera-b"]);
const secret = () => {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET es obligatorio en producción");
  return "drillops-demo-only-secret-change-in-production";
};

export function signSession(payload: Omit<DemoSession,"exp">): string {
  const data = Buffer.from(JSON.stringify({ ...payload, exp: Date.now()+8*60*60*1000 })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifySession(token?: string): DemoSession | null {
  try {
    if (!token) return null;
    const [data,sig,...extra] = token.split(".");
    if (!data || !sig || extra.length) return null;
    const expected = crypto.createHmac("sha256", secret()).update(data).digest("base64url");
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const session = JSON.parse(Buffer.from(data,"base64url").toString()) as Partial<DemoSession>;
    if (typeof session.email !== "string" || typeof session.name !== "string" || typeof session.role !== "string" || !validRoles.has(session.role) || !validTenants.has(session.tenantId as DemoSession["tenantId"]) || typeof session.exp !== "number") return null;
    return session.exp > Date.now() ? session as DemoSession : null;
  } catch {
    return null;
  }
}
