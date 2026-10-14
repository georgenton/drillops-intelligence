import { eq } from "drizzle-orm";
import type { TenantId } from "@/packages/domain/types";
import { db } from "./client";
import { tenants } from "./schema";

const tenantSlugs: Record<TenantId, string> = {
  extract: "extract-services-demo",
  "minera-a": "cliente-minero-demo-a",
  "minera-b": "cliente-minero-demo-b",
};

export async function resolveTenantDatabaseId(tenantId: TenantId): Promise<string | null> {
  if (!db) return null;
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, tenantSlugs[tenantId])).limit(1);
  return tenant?.id ?? null;
}
