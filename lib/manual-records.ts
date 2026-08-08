import { z } from "zod";

export const manualRecordKinds = ["rig", "drillhole", "shift", "interval"] as const;
export type ManualRecordKind = (typeof manualRecordKinds)[number];

const requiredText = (label: string) => z.string().trim().min(1, `${label} es obligatorio`).max(160);
const finiteNumber = (label: string) => z.coerce.number({ invalid_type_error: `${label} debe ser numérico` }).finite();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const tenantId = z.enum(["extract", "minera-a", "minera-b"]);

export const rigRecordSchema = z.object({
  code: requiredText("Código").max(32).transform((value) => value.toUpperCase()),
  manufacturer: requiredText("Fabricante"),
  model: requiredText("Modelo"),
  serial: requiredText("Serie").max(80),
  site: requiredText("Sitio"),
  hourlyCost: finiteNumber("Costo por hora").min(0).max(1_000_000),
  active: z.boolean().default(true),
  source: z.enum(["manual_analog", "digital", "sensor"]),
  capabilities: z.array(z.enum(["pressure", "torque", "rpm", "water", "depth"]).or(z.string().min(1))).min(1, "Selecciona al menos una capacidad"),
});

export const drillholeRecordSchema = z.object({
  code: requiredText("Código").max(32).transform((value) => value.toUpperCase()),
  project: requiredText("Proyecto"),
  rigId: requiredText("Taladro"),
  targetDepth: finiteNumber("Profundidad objetivo").positive().max(100_000),
  currentDepth: finiteNumber("Profundidad actual").min(0).max(100_000),
  diameter: z.enum(["PQ", "HQ", "NQ"]),
  status: z.enum(["drilling", "planned", "completed"]),
  startDate: isoDate,
  eta: isoDate,
}).superRefine((value, context) => {
  if (value.currentDepth > value.targetDepth) context.addIssue({ code: z.ZodIssueCode.custom, path: ["currentDepth"], message: "La profundidad actual no puede superar el objetivo" });
  if (value.eta < value.startDate) context.addIssue({ code: z.ZodIssueCode.custom, path: ["eta"], message: "La fecha estimada debe ser posterior al inicio" });
});

export const shiftRecordSchema = z.object({
  drillholeId: requiredText("Sondeo"),
  rigId: requiredText("Taladro"),
  date: isoDate,
  type: z.enum(["Día", "Noche"]),
  crew: requiredText("Cuadrilla"),
  depthStart: finiteNumber("Profundidad inicial").min(0).max(100_000),
  depthEnd: finiteNumber("Profundidad final").min(0).max(100_000),
  effectiveHours: finiteNumber("Horas efectivas").min(0).max(24),
  totalHours: finiteNumber("Horas del turno").positive().max(24),
  npt: z.record(z.string(), z.number().min(0)).default({}),
}).superRefine((value, context) => {
  if (value.depthEnd < value.depthStart) context.addIssue({ code: z.ZodIssueCode.custom, path: ["depthEnd"], message: "La profundidad final debe ser mayor o igual a la inicial" });
  if (value.effectiveHours > value.totalHours) context.addIssue({ code: z.ZodIssueCode.custom, path: ["effectiveHours"], message: "Las horas efectivas no pueden superar las horas del turno" });
  const npt = Object.values(value.npt).reduce((sum, hours) => sum + hours, 0);
  if (value.effectiveHours + npt > value.totalHours + 0.001) context.addIssue({ code: z.ZodIssueCode.custom, path: ["npt"], message: "Horas efectivas + NPT no pueden superar la duración del turno" });
});

export const intervalRecordSchema = z.object({
  drillholeId: requiredText("Sondeo"),
  shiftId: requiredText("Turno"),
  rigId: requiredText("Taladro"),
  startDepth: finiteNumber("Profundidad inicial").min(0).max(100_000),
  endDepth: finiteNumber("Profundidad final").positive().max(100_000),
  minutes: finiteNumber("Minutos").positive().max(1_440),
  bitCode: requiredText("Corona").max(80),
  pressure: finiteNumber("Presión").min(0).max(100_000).optional(),
  torque: finiteNumber("Torque").min(0).max(1_000_000).optional(),
  rpm: finiteNumber("RPM").min(0).max(100_000).optional(),
  waterFlow: finiteNumber("Flujo de agua").min(0).max(1_000_000).optional(),
  waterReturn: z.enum(["complete", "partial", "lost"]),
  recovery: finiteNumber("Recuperación").min(0).max(100),
  hardness: z.coerce.number().int().min(1).max(5),
  fracturing: z.enum(["low", "medium", "high"]),
  abrasivity: z.enum(["low", "medium", "high"]),
  vibration: z.enum(["low", "medium", "high"]),
  stability: z.enum(["stable", "unstable"]),
  comment: z.string().trim().max(500),
  source: z.enum(["manual", "imported", "sensor"]),
}).superRefine((value, context) => {
  if (value.endDepth <= value.startDepth) context.addIssue({ code: z.ZodIssueCode.custom, path: ["endDepth"], message: "La profundidad final debe superar la inicial" });
});

export const manualRecordEnvelopeSchema = z.object({
  tenantId,
  kind: z.enum(manualRecordKinds),
  payload: z.unknown(),
});

export const manualRecordSchemas = {
  rig: rigRecordSchema,
  drillhole: drillholeRecordSchema,
  shift: shiftRecordSchema,
  interval: intervalRecordSchema,
} as const;

export function validateManualRecord(kind: ManualRecordKind, payload: unknown) {
  return manualRecordSchemas[kind].safeParse(payload);
}
