import type { AdvisorInput, Crown, Level, Priority, Recommendation } from "./types";

const weights: Record<Priority, [number, number, number, number, number]> = {
  balanced: [0.35, 0.25, 0.20, 0.10, 0.10],
  speed: [0.25, 0.10, 0.45, 0.10, 0.10],
  cost: [0.25, 0.45, 0.10, 0.10, 0.10],
  life: [0.25, 0.10, 0.10, 0.45, 0.10],
};

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const normalize = (v: number, min: number, max: number) => max === min ? 0.7 : clamp((v - min) / (max - min));

export function confidenceFor(observations: number): Level {
  return observations >= 18 ? "high" : observations >= 8 ? "medium" : "low";
}

export function recommendCrowns(crowns: Crown[], input: AdvisorInput): Recommendation[] {
  const compatible = crowns.filter(c => c.tenantId === input.tenantId && c.diameter === input.diameter && (input.showUnavailable || c.stock - c.reserved > 0));
  if (!compatible.length) return [];
  const rops = compatible.map(c => c.historicalRop);
  const costs = compatible.map(c => c.historicalCost);
  const lives = compatible.map(c => c.historicalLife);
  const [ws, wc, wr, wl, wi] = weights[input.priority];

  return compatible.map(crown => {
    const available = crown.stock - crown.reserved;
    const hardness = crown.hardnessFit.includes(input.hardness) ? 1 : crown.hardnessFit.some(h => Math.abs(h - input.hardness) === 1) ? 0.65 : 0.25;
    const fracturing = crown.fracturingFit.includes(input.fracturing) ? 1 : 0.55;
    const similarity = hardness * 0.65 + fracturing * 0.35;
    const cost = 1 - normalize(crown.historicalCost, Math.min(...costs), Math.max(...costs));
    const rop = normalize(crown.historicalRop, Math.min(...rops), Math.max(...rops));
    const life = normalize(crown.historicalLife, Math.min(...lives), Math.max(...lives));
    const inventory = available <= 0 ? 0 : clamp(available / Math.max(crown.reorder * 2, 4));
    const score = (similarity * ws + cost * wc + rop * wr + life * wl + inventory * wi) * (available <= 0 ? 0.35 : 1);
    const reasons = [
      `${crown.historicalRop.toFixed(1)} m/h de ROP histórico`,
      `USD ${crown.historicalCost.toFixed(0)}/m en condiciones comparables`,
      available > 0 ? `${available} unidades disponibles` : "Sin stock — solo alternativa",
    ];
    return { crown, score: Math.round(score * 100), confidence: confidenceFor(crown.observations), reasons, similarity, cost, rop, life, inventory };
  }).sort((a, b) => b.score - a.score);
}
