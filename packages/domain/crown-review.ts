import { compareCrownHistory, type CrownHistory } from "./crown-history";

/** Presentation-only projection of the conservative history. Never reassigns metres. */
export function crownReview(history: CrownHistory) {
  const comparison = compareCrownHistory(history);
  const rows = history.runs.map(run => ({
    ...run,
    pairedMetres: run.ropMPerHour === null ? null : run.ropMPerHour * run.attributedHours,
    intervalM: run.startDepthM !== null && run.endDepthM !== null ? run.endDepthM - run.startDepthM : null,
  }));
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = JSON.stringify([row.rigCode, row.holeCode]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const depth = [...groups.entries()].map(([id, runs]) => {
    const bounded = runs.filter(r => r.startDepthM !== null && r.endDepthM !== null && r.endDepthM > r.startDepthM);
    const boundaries = [...new Set([0, ...bounded.flatMap(r => [r.startDepthM!, r.endDepthM!])])].sort((a,b) => a-b);
    const segments = boundaries.slice(0,-1).map((from, index) => {
      const to = boundaries[index+1];
      const covering = bounded.filter(r => r.startDepthM! <= from && r.endDepthM! >= to);
      const status = covering.length > 1 ? "OVERLAP" : covering.length === 0 ? "GAP" : covering[0].state === "IDENTITY_UNCONFIRMED" ? "UNIDENTIFIED" : "REPORTED";
      return { id: JSON.stringify([id,from,to,covering.map(r=>r.id).sort()]), from, to, length: to-from, status, runIds: covering.map(r=>r.id), label: status === "OVERLAP" ? "Solape" : status === "GAP" ? "Sin referencia" : covering[0].serial ?? "Sin identidad" };
    });
    return {id,label:`${runs[0].rigCode} · ${runs[0].holeCode ?? "Sin sondeo"}`,segments,unbounded:runs.filter(r=>!bounded.includes(r)).map(r=>r.id)};
  });
  return {comparison,rows,depth};
}
