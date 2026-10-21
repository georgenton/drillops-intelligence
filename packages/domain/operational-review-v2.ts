import type { OperationalReport, OperationalShift } from "@/packages/import/types";

const finite = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);
const sumKnown = (values: (number | null | undefined)[]) => {
  const known = values.filter(finite);
  return known.length ? known.reduce((sum, n) => sum + n, 0) : null;
};

/** Same pair policy as the operational summary; 0 m / 0 h is a valid pair, not a ROP. */
export function guardiaTotals(shifts: OperationalShift[]) {
  return (["day", "night", "total"] as const).map(guard => {
    const rows = shifts.filter(s => guard === "total" || s.shiftType === guard);
    const paired = rows.filter(s => finite(s.advanceM) && finite(s.drillingHours) && (s.drillingHours > 0 || s.advanceM === 0));
    const pairedMetres = sumKnown(paired.map(s => s.advanceM));
    const pairedHours = sumKnown(paired.map(s => s.drillingHours));
    return { guard, positions: rows.length, advanceM: sumKnown(rows.map(s => s.advanceM)), drillingHours: sumKnown(rows.map(s => s.drillingHours)), pairedMetres, pairedHours,
      ropMPerHour: pairedMetres !== null && pairedHours !== null && pairedHours > 0 ? pairedMetres / pairedHours : null,
      excludedKeys: rows.filter(s => !paired.includes(s)).map(s => s.logicalKey), missingAdvance: rows.filter(s => !finite(s.advanceM)).length, missingHours: rows.filter(s => !finite(s.drillingHours)).length };
  });
}

/** Fixed semantic colors: unaffected by sorting / hours and separate from guard colors. */
export function activityColor(label: string, index = 0) {
  const text = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/mudanza|traslado/.test(text)) return "#bd8cff";
  if (/perforacion/.test(text)) return "#41d6a3";
  return ["#2389ba", "#ff9f43", "#f4b942", "#ff6969"][index % 4];
}

/** Daily fluid measurements remain daily; never duplicate into day/night shift observations. */
export function fluidSeries(reports: OperationalReport[], label: "Presión" | "Caudal") {
  const seen = new Set<string>();
  return reports.flatMap(report => report.fluidParameters.filter(m => m.label === label).flatMap(m => {
    const id = `${report.key}|${m.key}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ id, date: report.date, rig: report.rigCode, hole: report.holeCode, shiftType: m.shiftType, value: m.validity === "observed" && finite(m.value) ? m.value : null,
      unit: m.unit ?? "unidad sin confirmar", source: report.source, cells: m.cells }];
  }));
}

/** Potential daily complements, displayed only if the selected context has no pressure reading. */
export function reviewPressureSeries(reports: OperationalReport[]) {
  return [...new Map(reports.map(r=>[r.key,r])).values()].filter(r=>!fluidSeries([r],"Presión").some(m=>m.value!==null)).map(r=>({ reportKey:r.key,date:r.date,rig:r.rigCode,hole:r.holeCode,value:100,unit:"PSI",classification:"SINTETICO" as const,original:null,source:r.source,reason:"Ejemplo separado de presión de fluido por reporte diario. Sólo se muestra cuando el filtro no tiene presión observada. No es lectura medida ni Pulldown; no completa el original." }));
}

/** Prefer the two shift measurements over a duplicated report total, retaining gaps as null. */
export function rigConsumptionTotals(reports: OperationalReport[], rigCode: string) {
  const seenReports = new Set<string>();
  const grouped = new Map<string, { label: string; unit: string; day: (number | null)[]; night: (number | null)[]; report: (number | null)[]; excludedTotals: string[] }>();
  for (const report of reports.filter(r => r.rigCode === rigCode)) {
    if (seenReports.has(report.key)) continue;
    seenReports.add(report.key);
    const measurements = [...new Map(report.consumptions.map(m => [m.key, m])).values()];
    for (const m of measurements) {
      const key = `${m.label}|${m.unit ?? "unidad sin confirmar"}`;
      const group = grouped.get(key) ?? { label: m.label, unit: m.unit ?? "unidad sin confirmar", day: [], night: [], report: [], excludedTotals: [] };
      grouped.set(key, group);
      if (m.shiftType === null && measurements.some(other => other.label === m.label && other.unit === m.unit && other.shiftType !== null)) { group.excludedTotals.push(`${report.key}|${m.key}`); continue; }
      group[m.shiftType ?? "report"].push(m.validity === "observed" && finite(m.value) && m.value >= 0 ? m.value : null);
    }
  }
  return [...grouped.values()].map(group => ({ label: group.label, unit: group.unit, day: sumKnown(group.day), night: sumKnown(group.night), report: sumKnown(group.report), total: sumKnown([...group.day, ...group.night, ...group.report]), missing: [...group.day, ...group.night, ...group.report].filter(v => v === null).length, excludedTotals: group.excludedTotals }));
}

/** Maintenance labels only. A mechanical downtime category may include non-maintenance activities. */
export function maintenanceHours(shifts: OperationalShift[]) {
  const activities = shifts.flatMap(s => s.activities.filter(a => /mantenim|reparaci[oó]n/i.test(a.label)).map(a => ({ ...a, shiftKey: s.logicalKey, shiftType: s.shiftType })));
  return { total: sumKnown(activities.map(a => a.hours)), day: sumKnown(activities.filter(a => a.shiftType === "day").map(a => a.hours)), night: sumKnown(activities.filter(a => a.shiftType === "night").map(a => a.hours)), missing: activities.filter(a => !finite(a.hours)).length, labels: [...new Set(activities.map(a => a.label))] };
}

/** Shared review-only partial rig cost, same known-value scope used by Dashboard and Reports. */
export function reviewEquipmentCost(shifts: OperationalShift[], tariff: number) {
  const metres = sumKnown(shifts.map(s => s.advanceM)), hours = sumKnown(shifts.map(s => s.drillingHours));
  const cost = hours !== null && finite(tariff) && tariff >= 0 ? hours * tariff : null;
  return { metres, hours, cost, perMetre: cost !== null && metres !== null && metres > 0 ? cost / metres : null,
    missingAdvance: shifts.filter(s => !finite(s.advanceM)).length, missingHours: shifts.filter(s => !finite(s.drillingHours)).length };
}
