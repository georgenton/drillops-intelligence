import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { manualRecordEnvelopeSchema, manualRecordKinds, type ManualRecordKind, validateManualRecord } from "@/lib/manual-records";
import { assertTenantAccess } from "@/lib/tenant-guard";
import { db } from "@/packages/db/client";
import { manualRecords } from "@/packages/db/schema";
import { resolveTenantDatabaseId } from "@/packages/db/tenant";
import type { TenantId } from "@/packages/domain/types";

export const runtime = "nodejs";

async function context(request: Request) {
  const session = verifySession((await cookies()).get("drillops_session")?.value);
  if (!session) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  const params = new URL(request.url).searchParams;
  const tenantId = (params.get("tenantId") ?? session.tenantId) as TenantId;
  try { assertTenantAccess(session, tenantId); } catch { return { error: NextResponse.json({ error: "Acceso de tenant denegado" }, { status: 403 }) }; }
  return { session, tenantId };
}
export async function GET(request: Request) {
  const access = await context(request);
  if ("error" in access) return access.error;
  const kind = new URL(request.url).searchParams.get("kind") as ManualRecordKind | null;
  if (!kind || !manualRecordKinds.includes(kind)) return NextResponse.json({ error: "Tipo de registro inválido" }, { status: 400 });
  if (!db) return NextResponse.json({ error: "Base de datos no disponible" }, { status: 503 });
  const tenantDatabaseId = await resolveTenantDatabaseId(access.tenantId);
  if (!tenantDatabaseId) return NextResponse.json({ error: "Empresa no configurada en la base" }, { status: 409 });
  const rows = await db.select().from(manualRecords).where(and(eq(manualRecords.tenantId, tenantDatabaseId), eq(manualRecords.kind, kind))).orderBy(desc(manualRecords.createdAt));
  return NextResponse.json({ records: rows.map((row) => ({ ...(row.payload as object), id: row.id, tenantId: access.tenantId, createdAt: row.createdAt })) });
}

export async function POST(request: Request) {
  const access = await context(request);
  if ("error" in access) return access.error;
  if (!db) return NextResponse.json({ error: "Base de datos no disponible" }, { status: 503 });
  const envelope = manualRecordEnvelopeSchema.safeParse(await request.json().catch(() => null));
  if (!envelope.success) return NextResponse.json({ error: "Solicitud inválida", details: envelope.error.flatten() }, { status: 400 });
  try { assertTenantAccess(access.session, envelope.data.tenantId); } catch { return NextResponse.json({ error: "Acceso de tenant denegado" }, { status: 403 }); }
  if (envelope.data.tenantId !== access.tenantId) return NextResponse.json({ error: "El tenant de la URL y del registro no coincide" }, { status: 400 });
  const parsed = validateManualRecord(envelope.data.kind, envelope.data.payload);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Registro inválido", details: parsed.error.flatten() }, { status: 422 });
  const tenantDatabaseId = await resolveTenantDatabaseId(access.tenantId);
  if (!tenantDatabaseId) return NextResponse.json({ error: "Empresa no configurada en la base" }, { status: 409 });

  if (envelope.data.kind === "rig" || envelope.data.kind === "drillhole") {
    const existing = await db.select({ payload: manualRecords.payload }).from(manualRecords).where(and(eq(manualRecords.tenantId, tenantDatabaseId), eq(manualRecords.kind, envelope.data.kind)));
    const code = (parsed.data as { code: string }).code.toLowerCase();
    if (existing.some((row) => String((row.payload as { code?: string }).code ?? "").toLowerCase() === code)) return NextResponse.json({ error: "Ya existe un registro manual con ese código" }, { status: 409 });
  }

  const [created] = await db.insert(manualRecords).values({ tenantId: tenantDatabaseId, kind: envelope.data.kind, payload: parsed.data, createdByEmail: access.session.email }).returning();
  return NextResponse.json({ record: { ...(created.payload as object), id: created.id, tenantId: access.tenantId, createdAt: created.createdAt } }, { status: 201 });
}
