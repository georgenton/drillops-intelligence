import type { OperationalReport, OperationalShift } from "@/packages/import/types";

export const RAUL_MSE_VERSION = "RAUL_HQ_NQ_EXPERIMENTAL_V1";
export const RAUL_MSE_PROFILES = { HQ: { axial: 1.521, rotational: 3.635 }, NQ: { axial: 2.283, rotational: 5.4542 } } as const;
export type RaulMseFamily = keyof typeof RAUL_MSE_PROFILES;
export type RaulMseInput = { pulldown: number | null; rpm: number | null; torque: number | null; rop: number | null };
export function resolveMseFamily(diameter: string | null | undefined): RaulMseFamily | null {
  const normalized = diameter?.trim().toUpperCase();
  // Explicit family followed only by a declared metric diameter is unambiguous.
  // Do not guess from a number alone, combined families or product names.
  const match = normalized?.match(/^(HQ|NQ)(?:\s*\(\s*\d+(?:[.,]\d+)?\s*MM\s*\))?$/);
  return match ? match[1] as RaulMseFamily : null;
}
export function calculateRaulMse(family: string | null | undefined, input: RaulMseInput) {
  const resolved = resolveMseFamily(family), profile = resolved ? RAUL_MSE_PROFILES[resolved] : null;
  if (!profile) return { value: null, status: "unsupported_family" as const, profile };
  if (Object.values(input).some(v => v === null || !Number.isFinite(v))) return { value: null, status: "missing_or_nonfinite_input" as const, profile };
  if (input.rop! <= 0 || input.pulldown! < 0 || input.rpm! < 0 || input.torque! < 0) return { value: null, status: "invalid_input" as const, profile };
  const value = profile.axial * input.pulldown! + profile.rotational * input.rpm! * input.torque! / input.rop!;
  return Number.isFinite(value) ? { value, status: "experimental" as const, profile } : { value: null, status: "nonfinite_result" as const, profile };
}
export type RaulMseSample = ReturnType<typeof calculateRaulMse> & {
  id: string; modelVersion: string; rigCode: string; holeCode: string | null; date: string; shiftType: string;
  shiftKey: string | null; diameter: string | null; family: RaulMseFamily | null;
  startDepthM: number | null; endDepthM: number | null; input: RaulMseInput;
  classification: "EXCEL + SUPUESTO" | "SINTETICO"; granularity: string;
  units: { pulldown: string; rpm: string; torque: string; rop: string; output: string };
  confirmation: string; scope: string; source: unknown; modelSource: string; formula: string; substitution: string;
};
function inputSource(row: OperationalShift) {
  return { ...row.source, cells: Object.fromEntries(Object.entries(row.source.cells).filter(([key]) => ["pulldown","rpm","torque","advanceM","advance","drillingHours","diameter","observedDip","observedAzimuth","startDepthM","endDepthM","startDepth","endDepth"].includes(key))) };
}
function sample(row: OperationalShift, synthetic = false, family?: RaulMseFamily): RaulMseSample {
  const resolved = family ?? resolveMseFamily(row.diameter);
  const input = synthetic ? { pulldown: 300, rpm: 600, torque: 100, rop: 2 } : {
    pulldown: row.parameters.pulldownPsi, rpm: row.parameters.rpm, torque: row.parameters.torque,
    rop: row.advanceM !== null && row.drillingHours !== null && row.advanceM >= 0 && row.drillingHours > 0 ? row.advanceM / row.drillingHours : null,
  };
  const result = calculateRaulMse(resolved, input);
  return { ...result, id: synthetic ? `synthetic-mse:${row.rigCode}:${row.holeCode}:${family}` : `mse:${row.logicalKey}`,
    modelVersion: RAUL_MSE_VERSION, rigCode: row.rigCode, holeCode: row.holeCode, date: row.date, shiftType: row.shiftType,
    shiftKey: synthetic ? null : row.logicalKey, diameter: synthetic ? family! : row.diameter ?? null, family: resolved,
    startDepthM: row.startDepthM, endDepthM: row.endDepthM, input,
    classification: synthetic ? "SINTETICO" : "EXCEL + SUPUESTO", granularity: synthetic ? "Ejemplo independiente; rango gráfico sintético, no intervalo medido" : "Promedios y ROP del mismo turno; no intervalo instrumental",
    units: { pulldown: "PSI (supuesto compatible con lectura; perfil sin confirmar)", rpm: "rpm", torque: "N·m SUPUESTO; unidad original no confirmada", rop: "m/h SUPUESTO para perfil", output: resolved === "HQ" ? "psi indicado en foto HQ; validez física pendiente" : "psi SUPUESTO para NQ; pendiente" },
    confirmation: "EXPERIMENTAL: confirmar unidades de Pulldown, TQ y ROP, salida NQ, coeficientes, equipo y calibración. No es MSE físicamente validada, UCS ni desgaste.",
    scope: `Revisión privada; equipo ${row.rigCode}; calibración del perfil pendiente`,
    modelSource: resolved === "HQ" ? "WhatsApp Image 2026-10-20 at 4.42.30 PM.jpeg · cabecera 23, HQ confirmado por Jorge" : resolved === "NQ" ? "WhatsApp Image 2026-10-20 at 4.46.00 PM.jpeg · línea superior NQ; línea PQ inferior excluida" : "Sin perfil manuscrito confirmado para esta familia",
    source: synthetic ? "Ejemplo autorizado independiente: Pulldown=300, RPM=600, TQ=100, ROP=2; no registro del cliente" : inputSource(row),
    formula: result.profile ? `${result.profile.axial} × Pulldown + (${result.profile.rotational} × RPM × TQ) / ROP` : "Familia no soportada: no se aplica HQ por defecto",
    substitution: result.profile ? `${result.profile.axial} × ${input.pulldown ?? "ausente"} + (${result.profile.rotational} × ${input.rpm ?? "ausente"} × ${input.torque ?? "ausente"}) / ${input.rop ?? "ausente"}` : "No calculable",
  };
}
/** No mutation, interpolation, imputation of real inputs or global family selector. */
export function buildReviewMse(shifts: OperationalShift[]): RaulMseSample[] {
  const result = shifts.map(row => sample(row));
  const groups = new Map<string, OperationalShift[]>();
  for (const row of shifts) { const key = `${row.rigCode}\0${row.holeCode}`; groups.set(key, [...groups.get(key) ?? [], row]); }
  for (const rows of groups.values()) {
    if (result.some(s => s.rigCode === rows[0].rigCode && s.holeCode === rows[0].holeCode && s.value !== null)) continue;
    const valid = rows.filter(r => r.startDepthM !== null && r.endDepthM !== null && Number.isFinite(r.startDepthM) && Number.isFinite(r.endDepthM) && r.endDepthM > r.startDepthM);
    const lo = valid.length ? Math.min(...valid.map(r => r.startDepthM!)) : 0, hi = valid.length ? Math.max(...valid.map(r => r.endDepthM!)) : 120;
    for (const [index, family] of (["HQ", "NQ"] as const).entries()) {
      const depth = lo + (hi - lo) * (index ? .75 : .25);
      result.push(sample({ ...rows[0], startDepthM: depth, endDepthM: depth }, true, family));
    }
  }
  return result;
}
export function reviewInclination(dip: number | null | undefined): number | null {
  return dip !== null && dip !== undefined && Number.isFinite(dip) && dip >= -90 && dip <= 0 ? 90 + dip : null;
}
function flowForShift(s:OperationalShift,reports:OperationalReport[]) {
  const matches=reports.filter(r=>r.date===s.date&&r.rigCode===s.rigCode&&r.holeCode===s.holeCode).flatMap(report=>report.fluidParameters.filter(m=>m.label.trim().toLocaleLowerCase("es")==="caudal"&&m.validity==="observed"&&m.value!==null&&Number.isFinite(m.value)&&m.value>=0&&Boolean(m.unit?.trim())&&(m.shiftType===null||m.shiftType===s.shiftType)).map(measurement=>({report,measurement}))).sort((a,b)=>{
    const exact=(r:OperationalReport)=>Number(r.source.file===s.source.file&&r.source.sheet===s.source.sheet);
    return exact(b.report)-exact(a.report)||`${a.report.source.file}\0${a.report.source.sheet}\0${a.report.key}\0${a.measurement.key}`.localeCompare(`${b.report.source.file}\0${b.report.source.sheet}\0${b.report.key}\0${b.measurement.key}`);
  });
  const selected=matches[0];
  if(selected){const {report,measurement}=selected;return {
    value:measurement.value!,unit:measurement.unit!.trim(),classification:"EXCEL + SUPUESTO",granularity:measurement.shiftType===null?"reporte diario":"turno",
    method:"Caudal observado del reporte de la misma fecha/equipo/sondeo, mostrado como referencia en el centro del rango del turno. La posición en profundidad es estimada, no una medición instrumental del intervalo. No se suma ni se convierte; GAL/MIN conserva tipo de galón pendiente. Si hay varias lecturas, se prioriza archivo/hoja del turno y después orden determinístico de fuente/clave.",
    source:{...report.source,reportKey:report.key,measurementKey:measurement.key,cells:measurement.cells,date:report.date,shiftType:measurement.shiftType},
    alternatives:matches.slice(1).map(m=>({reportKey:m.report.key,measurementKey:m.measurement.key,value:m.measurement.value,unit:m.measurement.unit})),
  };}
  return {value:50,unit:"L/min",classification:"SINTETICO",granularity:"ejemplo independiente",method:"Ejemplo independiente por rango gráfico sólo donde no hay caudal válido con unidad del mismo reporte/contexto; no medición ni conversión del consumo de agua. Tipo de galón pendiente: no se convierte a gl/min.",source:null,alternatives:[]};
}
export function buildReviewDepthComplements(shifts: OperationalShift[],reports:OperationalReport[] = []) {
  return shifts.filter(s => s.startDepthM !== null && s.endDepthM !== null && s.endDepthM > s.startDepthM).map(s => ({
    shiftKey: s.logicalKey, rigCode: s.rigCode, holeCode: s.holeCode, date: s.date, shiftType: s.shiftType,
    startDepthM: s.startDepthM!, endDepthM: s.endDepthM!,
    inclination: { value: reviewInclination(s.observedDip), syntheticReference: reviewInclination(s.observedDip) === null ? 10 : null, unit: "° desde vertical", originalDip: s.observedDip ?? null, classification: reviewInclination(s.observedDip) === null ? "SINTETICO (referencia separada)" : "EXCEL + SUPUESTO", method: "90° + DIP del mismo turno, sólo DIP entre −90° y 0°. Sin interpolar estaciones ni atribuir otra profundidad. Si falta, referencia sintética separada de 10°, no sustitución del DIP.", source: inputSource(s) },
    flow: flowForShift(s,reports),
  }));
}
