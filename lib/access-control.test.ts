import { describe, expect, it } from "vitest";
import {
  canAccessSection,
  canQueryBiMetric,
  canReadManualRecord,
  canViewConsumableCosts,
  canWriteManualRecord,
  defaultSection,
  normalizeRole,
  planCatalog,
  redactManualPayload,
} from "./access-control";

describe("permisos y planes definidos por Raúl", () => {
  it("mantiene precios, compromisos y límites reconciliados", () => {
    expect(planCatalog["Básico"]).toMatchObject({ monthlyPriceUsd: 350, minimumMonths: 4, minimumContractUsd: 1_400, machineLimit: 3 });
    expect(planCatalog["Intermedio"]).toMatchObject({ monthlyPriceUsd: 450, minimumMonths: 6, minimumContractUsd: 2_700, machineLimit: 6 });
    expect(planCatalog["Premium"]).toMatchObject({ monthlyPriceUsd: 600, minimumMonths: 12, minimumContractUsd: 7_200, machineLimit: null });
  });

  it("aplica plan y perfil como intersección", () => {
    expect(canAccessSection({ role: "general_manager", plan: "Básico", section: "bit-advisor" })).toBe(false);
    expect(canAccessSection({ role: "operations_supervisor", plan: "Premium", section: "bit-advisor" })).toBe(true);
    expect(canAccessSection({ role: "client", plan: "Premium", section: "inventario" })).toBe(false);
    expect(canAccessSection({ role: "control", plan: "Premium", section: "consumibles" })).toBe(true);
  });

  it("bloquea escrituras ajenas a cada perfil", () => {
    expect(canWriteManualRecord("client", "Premium", "shift")).toBe(false);
    expect(canWriteManualRecord("driller", "Premium", "interval")).toBe(true);
    expect(canWriteManualRecord("driller", "Premium", "rig")).toBe(false);
    expect(canWriteManualRecord("control", "Premium", "consumable")).toBe(true);
    expect(canReadManualRecord("driller", "Premium", "crown")).toBe(true);
    expect(canReadManualRecord("control", "Premium", "crown")).toBe(true);
  });

  it("evita filtraciones financieras por el asistente", () => {
    expect(canQueryBiMetric("operations_supervisor", "Premium", "metres")).toBe(true);
    expect(canQueryBiMetric("operations_supervisor", "Premium", "consumables")).toBe(false);
    expect(canQueryBiMetric("general_manager", "Premium", "consumables")).toBe(true);
    expect(canViewConsumableCosts("general_manager", "Intermedio")).toBe(false);
  });

  it("redacta costos también en las respuestas de registros", () => {
    expect(redactManualPayload("rig", { code: "MP-07", hourlyCost: 125 }, "operations_supervisor", "Premium")).toEqual({ code: "MP-07" });
    expect(redactManualPayload("consumable", { type: "Diesel", quantity: 40, cost: 90 }, "general_manager", "Intermedio")).toEqual({ type: "Diesel", quantity: 40 });
    expect(redactManualPayload("consumable", { type: "Diesel", quantity: 40, cost: 90 }, "control", "Premium")).toEqual({ type: "Diesel", quantity: 40, cost: 90 });
    expect(canWriteManualRecord("general_manager", "Básico", "crown")).toBe(false);
  });

  it("mantiene compatibilidad con roles anteriores", () => {
    expect(normalizeRole("tenant_owner")).toBe("general_manager");
    expect(normalizeRole("operator")).toBe("driller");
    expect(defaultSection("control", "Premium")).toBe("inventario");
  });
});
