import { recommendCrowns } from "./advisor";
import type { AdvisorInput, Crown, Priority } from "./types";

/** Reference weights, in similarity/cost/ROP/life/inventory order. Never reweighted for gaps. */
export const ORIGINAL_ADVISOR_WEIGHTS: Record<Priority, readonly number[]> = {
  balanced: [.35, .25, .20, .10, .10],
  speed: [.25, .10, .45, .10, .10],
  cost: [.25, .45, .10, .10, .10],
  life: [.25, .10, .10, .45, .10],
};
export type PrivateAdvisorProduct = {
  id: string; manufacturer: string; product: string; matrix: string | null;
  diameter: Crown["diameter"] | null; price: number | null;
  stock: number | null; reserved: number | null; reorder: number | null;
  historicalRop: number | null; historicalCost: number | null;
  historicalLife: number | null; observations: number | null;
  hardnessFit: number[] | null; fracturingFit: Crown["fracturingFit"] | null;
};
export function missingAdvisorCriteria(c: PrivateAdvisorProduct) {
  const missing: string[] = [];
  if (!c.diameter) missing.push("diámetro compatible");
  if (c.price === null) missing.push("precio de compra confirmado");
  if (!c.hardnessFit?.length || !c.fracturingFit?.length) missing.push("compatibilidad de dureza y fracturación");
  if (c.historicalRop === null) missing.push("ROP histórica comparable");
  if (c.historicalCost === null) missing.push("costo histórico por metro");
  if (c.historicalLife === null) missing.push("vida histórica de corridas terminadas");
  if (c.stock === null || c.reserved === null || c.reorder === null) missing.push("stock, reservas y reposición confirmados");
  if (c.observations === null) missing.push("número de observaciones comparables");
  return missing;
}
export function privateAdvisorRanking(products: PrivateAdvisorProduct[], input: AdvisorInput, canViewCosts: boolean) {
  const gaps = products.map(product => ({ product, missing: missingAdvisorCriteria(product) }));
  // Restricted readers must not receive a score that encodes hidden financial inputs.
  if (!canViewCosts) return { results: [], gaps, blocked: "El ranking original incluye costos en las cuatro prioridades. Este perfil conserva comparación operacional, sin sustituir ni revelar el factor financiero." };
  // Min/max normalization depends on the entire comparable set. Silently excluding incomplete
  // candidates would change the reference set, so do not manufacture a reduced ranking.
  if (gaps.some(g => g.missing.length)) return { results: [], gaps, blocked: "Faltan criterios del catálogo. Se conservan los pesos originales; no se genera un puntaje parcial." };
  const crowns: Crown[] = products.map(p => ({
    ...p, tenantId: input.tenantId, matrix: p.matrix ?? "No declarada",
    diameter: p.diameter!, price: p.price!,
    stock: p.stock!, reserved: p.reserved!, reorder: p.reorder!,
    historicalRop: p.historicalRop!, historicalCost: p.historicalCost!,
    historicalLife: p.historicalLife!, observations: p.observations!,
    hardnessFit: p.hardnessFit!, fracturingFit: p.fracturingFit!,
  }));
  return { results: recommendCrowns(crowns, input), gaps, blocked: null };
}
