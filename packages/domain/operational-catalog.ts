import { z } from "zod";

export const catalogCode = z.string().trim().min(1).max(80).transform(v => v.toUpperCase());
const nullableText = z.string().trim().min(1).max(160).nullable().default(null);
const nullableMeasure = z.number().finite().min(0).max(1_000_000).nullable().default(null);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const parsed = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === v;
});
export const surveyConfigurationSchema = z.object({
  angleConvention: z.enum(["inclination_from_vertical", "dip_negative_down", "dip_positive_down"]),
  azimuthReference: z.enum(["true_north", "magnetic_north", "grid_north"]),
  method: z.literal("minimum_curvature"),
  anchor: z.object({
    depthM: z.number().finite().nonnegative(),
    eastM: z.number().finite(), northM: z.number().finite(), tvdM: z.number().finite(),
  }).strict(),
  evidence: z.string().trim().min(5).max(1000),
}).strict();
export const rigCatalogSchema = z.object({
  code: catalogCode, name: nullableText, model: nullableText,
  status: z.enum(["operating", "maintenance", "inactive"]).nullable().default(null),
  mechanicalDowntimeActivities:z.array(z.string().trim().min(1).max(160)).max(100).nullable().default(null),
  mechanicalClassificationEvidence:z.string().trim().min(5).max(1000).nullable().default(null),
  // Omission means preserve an existing restricted value; null explicitly clears it.
  hourlyCostUsd: z.number().finite().nonnegative().max(1_000_000).nullable().optional(),
}).strict().refine(v=>(v.mechanicalDowntimeActivities===null)===(v.mechanicalClassificationEvidence===null),{message:"La clasificación mecánica exige lista explícita y evidencia juntas"});
export const holeCatalogSchema = z.object({
  code: catalogCode, rigCode: catalogCode, targetDepthM: nullableMeasure,
  plannedMetersPerShift: nullableMeasure,
  planStartDate: date.nullable().default(null),
  guardsPerDay: z.union([z.literal(1), z.literal(2)]).nullable().default(null),
  status: z.enum(["planned", "active", "completed", "paused"]).nullable().default(null),
  surveyConfiguration: surveyConfigurationSchema.nullable().default(null),
}).strict();
export const mseCalibrationSchema = z.object({
  rigCode:catalogCode,holeCode:catalogCode,date,
  depthM:z.number().finite().nonnegative(),
  wobN:z.number().finite().nonnegative(),torqueNm:z.number().finite().nonnegative(),
  rpm:z.number().finite().nonnegative(),ropMetresPerHour:z.number().finite().positive(),
  outerDiameterM:z.number().finite().positive().max(2),coreDiameterM:z.number().finite().nonnegative().max(2),
  unitsConfirmed:z.literal(true),geometryConfirmed:z.literal(true),
  measurementLocation:z.enum(["surface","downhole"]),
  evidence:z.string().trim().min(5).max(1000),
}).strict().refine(v=>v.coreDiameterM<v.outerDiameterM,{message:"El diámetro interior debe ser menor al exterior"});
export const crownCatalogSchema=z.object({
  code:catalogCode,manufacturer:nullableText,product:nullableText,matrix:nullableText,
  diameter:z.enum(["PQ","HQ","NQ"]).nullable().default(null),
  priceUsd:z.number().finite().nonnegative().max(1_000_000).nullable().optional(),
  referenceLifeM:nullableMeasure,
  reorderPointUnits:z.number().int().nonnegative().max(1_000_000).nullable().default(null),
  hardnessFit:z.array(z.number().int().min(1).max(5)).min(1).max(5).nullable().default(null),
  fracturingFit:z.array(z.enum(["low","medium","high"])).min(1).max(3).nullable().default(null),
  mseCalibration:mseCalibrationSchema.nullable().default(null),
}).strict();
export const catalogMutationSchema = z.discriminatedUnion("kind", [
  z.object({kind:z.literal("rig"),record:rigCatalogSchema,revision:z.number().int().positive().optional(),reason:z.string().trim().min(5).max(500)}).strict(),
  z.object({kind:z.literal("hole"),record:holeCatalogSchema,revision:z.number().int().positive().optional(),reason:z.string().trim().min(5).max(500)}).strict(),
  z.object({kind:z.literal("crown"),record:crownCatalogSchema,revision:z.number().int().positive().optional(),reason:z.string().trim().min(5).max(500)}).strict(),
]);
export type CatalogMutation = z.infer<typeof catalogMutationSchema>;
export type RigCatalogRecord = z.infer<typeof rigCatalogSchema> & {revision:number;source:"configured"|"observed"};
export type HoleCatalogRecord = z.infer<typeof holeCatalogSchema> & {revision:number;source:"configured"|"observed"};
export type CrownCatalogRecord = z.infer<typeof crownCatalogSchema> & {revision:number;source:"configured"|"observed"};
export type OperationalCatalog = {
  rigs:RigCatalogRecord[]; holes:HoleCatalogRecord[];crowns:CrownCatalogRecord[];
  canWriteRigs:boolean;canWriteHoles:boolean;canWriteCrowns:boolean;canConfigureCosts:boolean;
};
