/** Scheduled twelve-hour shifts, not the (possibly incomplete) sum of reported activities. */
export function shiftUtilization(drillingHours: number | null): number | null {
  if (drillingHours === null || !Number.isFinite(drillingHours) || drillingHours < 0 || drillingHours > 12) return null;
  return drillingHours / 12 * 100;
}

/** Depth at the most recent valid observation, never a sum or period advance. */
export function observedDepth(rows: readonly {
  date: string; shiftType: string; holeCode: string | null; endDepthM: number | null;
}[]): number | null {
  const holes = new Set(rows.map(row => row.holeCode).filter(Boolean));
  if (holes.size !== 1) return null;
  const valid = rows.filter(row => row.holeCode && row.endDepthM !== null && Number.isFinite(row.endDepthM) && row.endDepthM >= 0);
  valid.sort((a, b) => a.date.localeCompare(b.date) || (a.shiftType === "night" ? 1 : 0) - (b.shiftType === "night" ? 1 : 0));
  const latest = valid.at(-1);
  if (!latest) return null;
  const sameCut = valid.filter(row => row.date === latest.date && row.shiftType === latest.shiftType);
  return new Set(sameCut.map(row => row.endDepthM)).size === 1 ? latest.endDepthM : null;
}
