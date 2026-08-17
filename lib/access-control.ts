import type { ManualRecordKind } from "@/lib/manual-records";
import type { BiMetric } from "@/packages/bi/types";
import type { PlanName } from "@/packages/domain/types";

export const canonicalRoles = [
  "platform_admin",
  "general_manager",
  "client",
  "operations_supervisor",
  "driller",
  "control",
] as const;

export type AppRole = (typeof canonicalRoles)[number];
export type LegacyRole = "tenant_owner" | "admin" | "supervisor" | "operator" | "viewer";
export type SessionRole = AppRole | LegacyRole;

export const appSections = [
  "dashboard",
  "operacion",
  "sondeos",
  "taladros",
  "turnos",
  "intervalos",
  "coronas",
  "bit-advisor",
  "inventario",
  "consumibles",
  "survey",
  "depth-intelligence",
  "analitica",
  "importaciones",
  "drill-assistant",
  "reportes",
  "configuracion",
  "facturacion",
  "tenants",
] as const;

export type AppSection = (typeof appSections)[number];

export interface PlanDefinition {
  name: PlanName;
  monthlyPriceUsd: number;
  minimumMonths: number;
  minimumContractUsd: number;
  machineLimit: number | null;
  consumableCosts: boolean;
  enabledSections: ReadonlySet<AppSection>;
  summary: string;
}

const tenantSections = appSections.filter((section) => section !== "tenants");
const without = (...blocked: AppSection[]) => new Set(tenantSections.filter((section) => !blocked.includes(section)));

export const planCatalog: Record<PlanName, PlanDefinition> = {
  "Básico": {
    name: "Básico",
    monthlyPriceUsd: 350,
    minimumMonths: 4,
    minimumContractUsd: 1_400,
    machineLimit: 3,
    consumableCosts: false,
    enabledSections: without("coronas", "bit-advisor", "survey", "depth-intelligence", "drill-assistant"),
    summary: "Captura operacional y consumibles en unidades, sin módulos avanzados.",
  },
  "Intermedio": {
    name: "Intermedio",
    monthlyPriceUsd: 450,
    minimumMonths: 6,
    minimumContractUsd: 2_700,
    machineLimit: 6,
    consumableCosts: false,
    enabledSections: without("depth-intelligence", "drill-assistant"),
    summary: "Operación, coronas, Bit Advisor y Survey; consumibles sin costos.",
  },
  "Premium": {
    name: "Premium",
    monthlyPriceUsd: 600,
    minimumMonths: 12,
    minimumContractUsd: 7_200,
    machineLimit: null,
    consumableCosts: true,
    enabledSections: new Set(tenantSections),
    summary: "Acceso total, personalización y máquinas ilimitadas.",
  },
};

const roleSections: Record<AppRole, ReadonlySet<AppSection>> = {
  platform_admin: new Set(appSections),
  general_manager: new Set(tenantSections),
  client: new Set(["dashboard", "operacion", "sondeos", "taladros", "turnos", "intervalos", "coronas", "survey", "depth-intelligence", "analitica", "reportes"]),
  operations_supervisor: new Set(["dashboard", "operacion", "sondeos", "taladros", "turnos", "intervalos", "coronas", "bit-advisor", "inventario", "consumibles", "survey", "depth-intelligence", "analitica", "importaciones", "drill-assistant", "reportes"]),
  driller: new Set(["operacion", "sondeos", "taladros", "turnos", "intervalos", "inventario", "consumibles"]),
  control: new Set(["inventario", "consumibles"]),
};

const writeKinds: Record<AppRole, ReadonlySet<ManualRecordKind>> = {
  platform_admin: new Set(["rig", "drillhole", "shift", "interval", "crown", "inventory_movement", "supply_stock", "consumable", "report_attachment"]),
  general_manager: new Set(["rig", "drillhole", "shift", "interval", "crown", "inventory_movement", "supply_stock", "consumable", "report_attachment"]),
  client: new Set(),
  operations_supervisor: new Set(["rig", "drillhole", "shift", "interval", "crown", "inventory_movement", "supply_stock", "consumable", "report_attachment"]),
  driller: new Set(["shift", "interval", "inventory_movement", "supply_stock", "consumable"]),
  control: new Set(["inventory_movement", "supply_stock", "consumable"]),
};

const readKinds: Record<AppRole, ReadonlySet<ManualRecordKind>> = {
  platform_admin: writeKinds.platform_admin,
  general_manager: writeKinds.general_manager,
  client: new Set(["rig", "drillhole", "shift", "interval", "crown", "report_attachment"]),
  operations_supervisor: writeKinds.operations_supervisor,
  driller: new Set(["rig", "drillhole", "shift", "interval", "crown", "inventory_movement", "supply_stock", "consumable"]),
  control: new Set(["crown", "inventory_movement", "supply_stock", "consumable"]),
};

const kindSections: Partial<Record<ManualRecordKind, AppSection>> = {
  rig: "taladros",
  drillhole: "sondeos",
  shift: "turnos",
  interval: "intervalos",
  crown: "coronas",
  inventory_movement: "inventario",
  supply_stock: "inventario",
  consumable: "consumibles",
  report_attachment: "reportes",
};

export const roleLabels: Record<AppRole, string> = {
  platform_admin: "Administración de plataforma",
  general_manager: "Gerente General",
  client: "Cliente",
  operations_supervisor: "Supervisor de Operaciones",
  driller: "Perforador",
  control: "Control",
};

export function normalizeRole(role: SessionRole | string): AppRole {
  const legacy: Record<string, AppRole> = {
    tenant_owner: "general_manager",
    admin: "general_manager",
    supervisor: "operations_supervisor",
    operator: "driller",
    viewer: "client",
  };
  return canonicalRoles.includes(role as AppRole) ? role as AppRole : legacy[role] ?? "client";
}

export function isAppSection(value: string): value is AppSection {
  return appSections.includes(value as AppSection);
}

export function canAccessSection(input: { role: SessionRole | string; plan: PlanName; section: AppSection; billingEnabled?: boolean }): boolean {
  const role = normalizeRole(input.role);
  if (role === "platform_admin") return input.section !== "facturacion" || Boolean(input.billingEnabled);
  if (input.section === "tenants") return false;
  if (input.section === "facturacion" && !input.billingEnabled) return false;
  return roleSections[role].has(input.section) && planCatalog[input.plan].enabledSections.has(input.section);
}

export function visibleSections(role: SessionRole | string, plan: PlanName, billingEnabled = false): AppSection[] {
  return appSections.filter((section) => canAccessSection({ role, plan, section, billingEnabled }));
}

export function defaultSection(role: SessionRole | string, plan: PlanName): AppSection {
  return visibleSections(role, plan, false).find((section) => section !== "tenants") ?? "dashboard";
}

export function canViewOperationalCosts(role: SessionRole | string): boolean {
  const normalized = normalizeRole(role);
  return normalized === "platform_admin" || normalized === "general_manager" || normalized === "control";
}

export function canViewConsumableCosts(role: SessionRole | string, plan: PlanName): boolean {
  return canViewOperationalCosts(role) && planCatalog[plan].consumableCosts;
}

export function canReadManualRecord(role: SessionRole | string, plan: PlanName, kind: ManualRecordKind): boolean {
  const normalized = normalizeRole(role);
  const section = kindSections[kind];
  if (!readKinds[normalized].has(kind)) return false;
  if (kind === "crown") {
    return canAccessSection({ role: normalized, plan, section: "coronas", billingEnabled: true }) || canAccessSection({ role: normalized, plan, section: "inventario", billingEnabled: true });
  }
  return !section || canAccessSection({ role: normalized, plan, section, billingEnabled: true });
}

export function canWriteManualRecord(role: SessionRole | string, plan: PlanName, kind: ManualRecordKind): boolean {
  const normalized = normalizeRole(role);
  const section = kindSections[kind];
  return writeKinds[normalized].has(kind) && (!section || canAccessSection({ role: normalized, plan, section, billingEnabled: true }));
}

export function canUseAssistant(role: SessionRole | string, plan: PlanName): boolean {
  return canAccessSection({ role, plan, section: "drill-assistant" });
}

export function canQueryBiMetric(role: SessionRole | string, plan: PlanName, metric: BiMetric): boolean {
  if (!canUseAssistant(role, plan)) return false;
  if (metric === "consumables") return canViewConsumableCosts(role, plan);
  if (metric === "crowns") return canViewOperationalCosts(role);
  return true;
}

export function redactManualPayload(kind: ManualRecordKind, payload: Record<string, unknown>, role: SessionRole | string, plan: PlanName): Record<string, unknown> {
  const copy = { ...payload };
  if (!canViewOperationalCosts(role)) {
    if (kind === "rig") delete copy.hourlyCost;
    if (kind === "crown") {
      delete copy.price;
      delete copy.historicalCost;
    }
  }
  if (kind === "consumable" && !canViewConsumableCosts(role, plan)) delete copy.cost;
  return copy;
}

export function tenantPlan(tenantId: string): PlanName {
  if (tenantId === "minera-a") return "Básico";
  if (tenantId === "minera-b") return "Intermedio";
  return "Premium";
}
