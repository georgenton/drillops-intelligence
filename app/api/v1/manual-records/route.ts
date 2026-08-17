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
import { canReadManualRecord, canViewOperationalCosts, canWriteManualRecord, planCatalog, redactManualPayload, tenantPlan } from "@/lib/access-control";
import { loadBiDataset } from "@/packages/bi/data-source";

export const runtime = "nodejs";

async function context(request: Request) {
  const session = verifySession((await cookies()).get("drillops_session")?.value);
  if (!session) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  const params = new URL(request.url).searchParams;
  const tenantId = (params.get("tenantId") ?? session.tenantId) as TenantId;
  try { assertTenantAccess(session, tenantId); } catch { return { error: NextResponse.json({ error: "Acceso de tenant denegado" }, { status: 403 }) }; }
  return { session, tenantId, plan: tenantPlan(tenantId) };
}
export async function GET(request: Request) {
  const access = await context(request);
  if ("error" in access) return access.error;
  const kind = new URL(request.url).searchParams.get("kind") as ManualRecordKind | null;
  if (!kind || !manualRecordKinds.includes(kind)) return NextResponse.json({ error: "Tipo de registro inválido" }, { status: 400 });
  if (!canReadManualRecord(access.session.role, access.plan, kind)) return NextResponse.json({ error: "Tu perfil o plan no permite consultar este registro" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Base de datos no disponible" }, { status: 503 });
  const tenantDatabaseId = await resolveTenantDatabaseId(access.tenantId);
  if (!tenantDatabaseId) return NextResponse.json({ error: "Empresa no configurada en la base" }, { status: 409 });
  const rows = await db.select().from(manualRecords).where(and(eq(manualRecords.tenantId, tenantDatabaseId), eq(manualRecords.kind, kind))).orderBy(desc(manualRecords.createdAt));
  return NextResponse.json({ records: rows.map((row) => ({ ...redactManualPayload(kind, row.payload as Record<string, unknown>, access.session.role, access.plan), id: row.id, tenantId: access.tenantId, createdAt: row.createdAt })) });
}

export async function POST(request: Request) {
  const access = await context(request);
  if ("error" in access) return access.error;
  const envelope = manualRecordEnvelopeSchema.safeParse(await request.json().catch(() => null));
  if (!envelope.success) return NextResponse.json({ error: "Solicitud inválida", details: envelope.error.flatten() }, { status: 400 });
  try { assertTenantAccess(access.session, envelope.data.tenantId); } catch { return NextResponse.json({ error: "Acceso de tenant denegado" }, { status: 403 }); }
  if (envelope.data.tenantId !== access.tenantId) return NextResponse.json({ error: "El tenant de la URL y del registro no coincide" }, { status: 400 });
  if (!canWriteManualRecord(access.session.role, access.plan, envelope.data.kind)) return NextResponse.json({ error: "Tu perfil o plan no permite crear este registro" }, { status: 403 });
  const parsed = validateManualRecord(envelope.data.kind, envelope.data.payload);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Registro inválido", details: parsed.error.flatten() }, { status: 422 });

  if (!canViewOperationalCosts(access.session.role)) {
    const values = parsed.data as Record<string, unknown>;
    const unauthorizedCost = envelope.data.kind === "rig" ? Number(values.hourlyCost ?? 0) : envelope.data.kind === "crown" ? Number(values.price ?? 0) + Number(values.historicalCost ?? 0) : envelope.data.kind === "consumable" ? Number(values.cost ?? 0) : 0;
    if (unauthorizedCost > 0) return NextResponse.json({ error: "Tu perfil no permite registrar valores financieros" }, { status: 403 });
  }

  if (!db) return NextResponse.json({ error: "Base de datos no disponible" }, { status: 503 });
  const tenantDatabaseId = await resolveTenantDatabaseId(access.tenantId);
  if (!tenantDatabaseId) return NextResponse.json({ error: "Empresa no configurada en la base" }, { status: 409 });

  if (envelope.data.kind === "rig") {
    const limit = planCatalog[access.plan].machineLimit;
    if (limit != null) {
      const dataset = await loadBiDataset(access.tenantId);
      if (dataset.rigs.length >= limit) return NextResponse.json({ error: `El plan ${access.plan} permite un máximo de ${limit} máquinas` }, { status: 409 });
    }
  }

  if (envelope.data.kind === "rig" || envelope.data.kind === "drillhole" || envelope.data.kind === "crown") {
    const existing = await db.select({ payload: manualRecords.payload }).from(manualRecords).where(and(eq(manualRecords.tenantId, tenantDatabaseId), eq(manualRecords.kind, envelope.data.kind)));
    const uniqueField = envelope.data.kind === "crown" ? "product" : "code";
    const uniqueValue = String((parsed.data as Record<string, unknown>)[uniqueField]).toLowerCase();
    if (existing.some((row) => String((row.payload as Record<string, unknown>)[uniqueField] ?? "").toLowerCase() === uniqueValue)) return NextResponse.json({ error: `Ya existe un registro manual con ese ${uniqueField === "code" ? "código" : "producto"}` }, { status: 409 });
  }

  const [created] = await db.insert(manualRecords).values({ tenantId: tenantDatabaseId, kind: envelope.data.kind, payload: parsed.data, createdByEmail: access.session.email }).returning();
  return NextResponse.json({ record: { ...redactManualPayload(envelope.data.kind, created.payload as Record<string, unknown>, access.session.role, access.plan), id: created.id, tenantId: access.tenantId, createdAt: created.createdAt } }, { status: 201 });
}
