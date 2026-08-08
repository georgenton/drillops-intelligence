import { and, eq } from "drizzle-orm";
import { getDemoBiDataset } from "@/lib/bi-data";
import { db } from "@/packages/db/client";
import {
  bitProducts,
  bitRuns,
  drillholes as dbDrillholes,
  intervals as dbIntervals,
  inventory,
  manualRecords,
  projects,
  rigs as dbRigs,
  shifts as dbShifts,
  surveys as dbSurveys,
} from "@/packages/db/schema";
import { resolveTenantDatabaseId } from "@/packages/db/tenant";
import { calculateRop, safeDivide } from "@/packages/domain/calculations";
import type { BiDataset } from "./types";
import type { Crown, Diameter, Drillhole, Interval, Level, Rig, Shift, TenantId } from "@/packages/domain/types";

const number = (value: string | number | null | undefined) => Number(value ?? 0);

function mergeManual<T extends { id: string }>(seed: T[], rows: Array<{ id: string; payload: unknown }>): T[] {
  const manual = rows.map((row) => ({ ...(row.payload as object), id: row.id }) as T);
  const ids = new Set(manual.map((row) => row.id));
  return [...seed.filter((row) => !ids.has(row.id)), ...manual];
}

export async function loadBiDataset(tenantId: TenantId): Promise<BiDataset> {
  const demo = getDemoBiDataset(tenantId);
  if (!db) return demo;

  try {
    const tenantScope = await resolveTenantDatabaseId(tenantId);
    if (!tenantScope) return demo;
    if (process.env.DEMO_MODE !== "false") {
      const rows = await db.select({ id: manualRecords.id, kind: manualRecords.kind, payload: manualRecords.payload }).from(manualRecords).where(eq(manualRecords.tenantId, tenantScope));
      if (!rows.length) return demo;
      const ofKind = (kind: string) => rows.filter((row) => row.kind === kind);
      return {
        ...demo,
        source: "database",
        rigs: mergeManual<Rig>(demo.rigs, ofKind("rig")),
        drillholes: mergeManual<Drillhole>(demo.drillholes, ofKind("drillhole")),
        shifts: mergeManual<Shift>(demo.shifts, ofKind("shift")),
        intervals: mergeManual<Interval>(demo.intervals, ofKind("interval")),
      };
    }
    const [holeRows, rigRows, shiftRows, intervalRows, productRows, runRows, inventoryRows, surveyRows] = await Promise.all([
      db.select({
        id: dbDrillholes.id,
        code: dbDrillholes.code,
        project: projects.name,
        rigId: dbDrillholes.rigId,
        targetDepth: dbDrillholes.targetDepth,
        currentDepth: dbDrillholes.currentDepth,
        diameter: dbDrillholes.diameter,
        status: dbDrillholes.status,
        startDate: dbDrillholes.startDate,
        eta: dbDrillholes.estimatedFinish,
      }).from(dbDrillholes).leftJoin(projects, eq(dbDrillholes.projectId, projects.id)).where(eq(dbDrillholes.tenantId, tenantScope)),
      db.select().from(dbRigs).where(eq(dbRigs.tenantId, tenantScope)),
      db.select().from(dbShifts).where(eq(dbShifts.tenantId, tenantScope)),
      db.select({
        id: dbIntervals.id,
        shiftId: dbIntervals.shiftId,
        drillholeId: dbIntervals.drillholeId,
        rigId: dbIntervals.rigId,
        startDepth: dbIntervals.startDepth,
        endDepth: dbIntervals.endDepth,
        minutes: dbIntervals.drillingMinutes,
        bitCode: bitProducts.matrix,
        pressure: dbIntervals.pressure,
        torque: dbIntervals.torque,
        rpm: dbIntervals.rpm,
        waterFlow: dbIntervals.waterFlow,
        waterReturn: dbIntervals.waterReturn,
        recovery: dbIntervals.coreRecovery,
        hardness: dbIntervals.hardness,
        fracturing: dbIntervals.fracturing,
        abrasivity: dbIntervals.abrasivity,
        vibration: dbIntervals.vibration,
        stability: dbIntervals.stability,
        comment: dbIntervals.comment,
        source: dbIntervals.source,
      }).from(dbIntervals)
        .leftJoin(bitRuns, eq(dbIntervals.bitRunId, bitRuns.id))
        .leftJoin(bitProducts, eq(bitRuns.bitProductId, bitProducts.id))
        .where(eq(dbIntervals.tenantId, tenantScope)),
      db.select().from(bitProducts).where(and(eq(bitProducts.tenantId, tenantScope), eq(bitProducts.active, true))),
      db.select().from(bitRuns).where(eq(bitRuns.tenantId, tenantScope)),
      db.select().from(inventory).where(eq(inventory.tenantId, tenantScope)),
      db.select().from(dbSurveys).where(eq(dbSurveys.tenantId, tenantScope)),
    ]);
    if (!holeRows.length || !shiftRows.length) return demo;

    const crowns: Crown[] = productRows.map((product) => {
      const productRuns = runRows.filter((run) => run.bitProductId === product.id);
      const completed = productRuns.filter((run) => run.exitDepth != null);
      const metres = completed.reduce((sum, run) => sum + Math.max(0, number(run.exitDepth) - number(run.entryDepth)), 0);
      const hours = completed.reduce((sum, run) => sum + number(run.drillingHours), 0);
      const cost = completed.reduce((sum, run) => sum + number(run.purchaseCost), 0);
      const stocks = inventoryRows.filter((item) => item.bitProductId === product.id);
      return {
        id: product.matrix.toLowerCase(),
        tenantId,
        manufacturer: product.manufacturer,
        product: product.productName,
        matrix: product.matrix,
        diameter: product.diameter as Diameter,
        price: number(product.purchasePrice),
        stock: stocks.reduce((sum, item) => sum + (item.quantityOnHand ?? 0), 0),
        reserved: stocks.reduce((sum, item) => sum + (item.reservedQuantity ?? 0), 0),
        reorder: stocks.reduce((sum, item) => sum + (item.reorderLevel ?? 0), 0),
        historicalRop: calculateRop(metres, hours),
        historicalCost: safeDivide(cost, metres),
        historicalLife: safeDivide(metres, completed.length),
        observations: completed.length,
        hardnessFit: [1, 2, 3, 4, 5],
        fracturingFit: ["low", "medium", "high"] as Level[],
      };
    });

    return {
      tenantId,
      source: "database",
      drillholes: holeRows.map((hole) => ({
        id: hole.id,
        tenantId,
        code: hole.code,
        project: hole.project ?? "Sin proyecto",
        rigId: hole.rigId ?? "",
        targetDepth: number(hole.targetDepth),
        currentDepth: number(hole.currentDepth),
        diameter: hole.diameter as Diameter,
        status: hole.status as "drilling" | "planned" | "completed",
        startDate: hole.startDate ?? "",
        eta: hole.eta ?? "",
      })),
      rigs: rigRows.map((rig) => ({
        id: rig.id,
        tenantId,
        code: rig.code,
        manufacturer: rig.manufacturer,
        model: rig.model,
        serial: rig.serial,
        site: "Base operacional",
        hourlyCost: number(rig.hourlyCost),
        active: rig.active ?? true,
        source: "digital",
        capabilities: Array.isArray(rig.capabilities) ? rig.capabilities.map(String) : Object.keys((rig.capabilities ?? {}) as object),
      })),
      shifts: shiftRows.map((shift) => ({
        id: shift.id,
        tenantId,
        drillholeId: shift.drillholeId,
        rigId: shift.rigId,
        date: shift.date,
        type: shift.shiftType === "Noche" ? "Noche" : "Día",
        crew: shift.crew ?? "Sin cuadrilla",
        depthStart: number(shift.depthStart),
        depthEnd: number(shift.depthEnd),
        effectiveHours: number(shift.effectiveHours),
        totalHours: number(shift.totalHours),
        npt: (shift.timeBreakdown ?? {}) as Record<string, number>,
      })),
      intervals: intervalRows.map((interval) => ({
        id: interval.id,
        tenantId,
        drillholeId: interval.drillholeId,
        shiftId: interval.shiftId,
        rigId: interval.rigId,
        startDepth: number(interval.startDepth),
        endDepth: number(interval.endDepth),
        minutes: number(interval.minutes),
        bitCode: interval.bitCode ?? "SIN-CORONA",
        pressure: interval.pressure == null ? undefined : number(interval.pressure),
        torque: interval.torque == null ? undefined : number(interval.torque),
        rpm: interval.rpm == null ? undefined : number(interval.rpm),
        waterFlow: interval.waterFlow == null ? undefined : number(interval.waterFlow),
        waterReturn: (interval.waterReturn ?? "complete") as "complete" | "partial" | "lost",
        recovery: number(interval.recovery),
        hardness: interval.hardness ?? 0,
        fracturing: (interval.fracturing ?? "low") as Level,
        abrasivity: (interval.abrasivity ?? "low") as Level,
        vibration: (interval.vibration ?? "low") as Level,
        stability: interval.stability === "unstable" ? "unstable" : "stable",
        comment: interval.comment ?? "",
        source: interval.source ?? "manual",
      })),
      crowns,
      survey: surveyRows.map((point) => ({ depth: number(point.measuredDepth), inclination: number(point.inclination), azimuth: number(point.azimuth) })),
    };
  } catch {
    return demo;
  }
}
