"use client";
import type { OperationalReport, OperationalShift } from "@/packages/import/types";
import { fluidSeries, guardiaTotals, reviewPressureSeries } from "@/packages/domain/operational-review-v2";
import { EChart } from "./echart";
import { FormulaInfo } from "./formula-info";
import { useReviewScenario } from "./review-scenario";

const fmt = (n: number | null) => n === null ? "—" : new Intl.NumberFormat("es-EC", { maximumFractionDigits: 3 }).format(n);
type Series = { name: string; unit: string; color: string; labels: string[]; values: (number | null)[]; detail: string; synthetic?: boolean };
function ParameterLine({ series }: { series: Series }) {
  const valid = series.values.filter((v): v is number => v !== null && Number.isFinite(v));
  return <section className="metric-range"><header><i style={{ background: series.color }}/><span>{series.name}</span><b>{fmt(valid.length ? valid.reduce((a,b)=>a+b,0)/valid.length : null)} {series.unit}</b></header>
    <div><span><small>MÍN.</small>{fmt(valid.length ? Math.min(...valid) : null)}</span><span><small>PROM.</small>{fmt(valid.length ? valid.reduce((a,b)=>a+b,0)/valid.length : null)}</span><span><small>MÁX.</small>{fmt(valid.length ? Math.max(...valid) : null)}</span></div>
    {valid.length ? <EChart ariaLabel={`Evolución de ${series.name}`} option={{ tooltip: { trigger: "axis" }, grid: { left: 48, right: 16, top: 30, bottom: 45 }, xAxis: { type: "category", data: series.labels, axisLabel: { color: "#89949d", hideOverlap: true, fontSize: 9 } }, yAxis: { type: "value", scale: true, name: series.unit, axisLabel: { color: "#89949d", fontSize: 9 }, splitLine: { lineStyle: { color: "#29353c" } } }, series: [{ name: series.name, type: "line", connectNulls: false, showSymbol: true, symbol: series.synthetic ? "diamond" : "circle", symbolSize: 6, data: series.values, lineStyle: { color: series.color, type: series.synthetic ? "dashed" : "solid" }, itemStyle: { color: series.color } }] }}/> : <p>La fuente no contiene valores válidos para esta serie. El complemento de revisión, cuando está habilitado, aparece separado e identificado.</p>}
    <small>{series.detail} · {valid.length}/{series.values.length} valores conocidos</small>
  </section>;
}

export function ReviewParametersV2({ shifts, reports }: { shifts: OperationalShift[]; reports: OperationalReport[] }) {
  const review = useReviewScenario();
  const ordered = [...shifts].sort((a,b)=>a.date.localeCompare(b.date)||a.rigCode.localeCompare(b.rigCode)||a.shiftType.localeCompare(b.shiftType));
  const labels = ordered.map(s=>`${s.date} ${s.shiftType === "day" ? "D" : "N"} ${s.rigCode}`);
  const shiftKeys = new Set(ordered.map(s=>s.logicalKey));
  const flow = review.enabled ? review.scenario!.reviewDepthComplements.filter(s=>shiftKeys.has(s.shiftKey)&&s.flow.classification==="SINTETICO").sort((a,b)=>a.date.localeCompare(b.date)||a.rigCode.localeCompare(b.rigCode)||a.shiftType.localeCompare(b.shiftType)) : [];
  const pressure = review.enabled && !fluidSeries(reports,"Presión").some(r=>r.value!==null) ? reviewPressureSeries(reports) : [];
  const absentFluids: string[] = [];
  const hiddenEmptyGroups: string[] = [];
  const series: Series[] = [
    { name: "RPM", unit: "rpm", color: "#bd8cff", values: ordered.map(s=>s.parameters.rpm) },
    { name: "Pulldown", unit: "PSI", color: "#56c7ff", values: ordered.map(s=>s.parameters.pulldownPsi) },
    { name: "Holdback", unit: "PSI", color: "#41d6a3", values: ordered.map(s=>s.parameters.holdbackPsi) },
    { name: "Torque", unit: "unidad sin confirmar", color: "#ff9f43", values: ordered.map(s=>s.parameters.torque) },
  ].map(s=>({ ...s, labels, detail: "Eje: fecha / guardia / equipo · observación agregada del turno, no telemetría" }));
  for (const label of ["Presión", "Caudal"] as const) {
    const rows = fluidSeries(reports, label).sort((a,b)=>a.date.localeCompare(b.date)||a.rig.localeCompare(b.rig));
    const syntheticShown = label === "Caudal" ? flow.length > 0 : pressure.length > 0;
    if (!rows.some(r=>r.value!==null)) absentFluids.push(label);
    const units = [...new Set(rows.map(r=>r.unit))];
    for (const unit of units) {
      const group = rows.filter(r=>r.unit===unit);
      if (review.enabled && (syntheticShown || rows.some(r=>r.value!==null)) && !group.some(r=>r.value!==null)) { hiddenEmptyGroups.push(`${label} (${unit}): ${group.length} lecturas ausentes`); continue; }
      series.push({ name: label === "Caudal" ? "Galonaje / caudal observado" : "Presión de fluido", unit, color: label === "Caudal" ? "#f4b942" : "#56c7ff", labels: group.map(r=>`${r.date} ${r.rig}`), values: group.map(r=>r.value), detail: "Eje: reporte diario / equipo · no duplicado por guardia ni confundido con pulldown" });
    }
    if (!units.length && !(review.enabled && syntheticShown)) series.push({ name: label, unit: "unidad sin confirmar", color: "#56c7ff", values: [], labels: [], detail: "Sin mediciones incorporadas" });
  }
  if (review.enabled) {
    for(const unit of [...new Set(flow.map(s=>s.flow.unit))]) { const group=flow.filter(s=>s.flow.unit===unit); series.push({ name: "Galonaje / caudal · ejemplo sintético", unit, color: "#f4b942", values: group.map(s=>s.flow.value), labels: group.map(s=>`${s.date} ${s.shiftType === "day" ? "D" : "N"} ${s.rigCode}`), synthetic: true, detail: "Sólo rangos sin caudal válido · mismos ejemplos de Depth; no consumo total de agua ni conversión de gls" }); }
    if(pressure.length)series.push({name:"Presión de fluido · ejemplo sintético",unit:"PSI",color:"#56c7ff",values:pressure.map(r=>r.value),labels:pressure.map(r=>`${r.date} ${r.rig}`),synthetic:true,detail:"100 PSI supuestos por reporte diario; no presión medida ni Pulldown"});
  }
return <section className="panel parameters-panel"><header className="panel-head"><div><h3>Parámetros de perforación</h3><p>Series por turno o reporte diario según la fuente. Las líneas unen observaciones, no crean mediciones intermedias.</p></div></header><div className="parameters-grid parameters-v2-grid">{series.map((s,i)=><ParameterLine key={`${s.name}|${s.unit}|${i}`} series={s}/>)}</div><FormulaInfo title="Granularidad, presión y galonaje"><p>RPM, pulldown, holdback y torque conservan las lecturas del turno. Presión y caudal proceden del bloque de fluido diario, con su propia unidad. La presión de fluido no reemplaza pulldown. Agua consumida por guardia no se divide por horas para inventar caudal. El ejemplo de revisión de 50 L/min es independiente de esas mediciones y es el mismo de Depth Intelligence.</p>{absentFluids.length>0&&<p>Sin valores originales válidos en este filtro: {absentFluids.join(", ")}. Los ejemplos sintéticos, si aparecen, son series independientes: no rellenan las celdas ni se convierten en mediciones del cliente.</p>}{hiddenEmptyGroups.length>0&&<p>No se dibujan grupos sin lecturas: {hiddenEmptyGroups.join("; ")}. Se conservan sus ausencias en el origen; la gráfica mantiene las observaciones válidas y, por separado, los ejemplos identificados.</p>}</FormulaInfo></section>;
}

export function GuardiaTotalsV2({ shifts }: { shifts: OperationalShift[] }) {
  const rows = guardiaTotals(shifts);
  return <section className="panel table-panel supplementary-panel"><header className="panel-head"><div><h3>Día, noche y total del periodo</h3><p>Mismos filtros de equipo, sondeo y fechas. Ausencia no equivale a cero.</p></div></header><table><thead><tr><th>Guardia</th><th>Avance conocido</th><th>Horas efectivas conocidas</th><th>ROP pareada</th><th>Cobertura ROP</th></tr></thead><tbody>{rows.map(r=><tr key={r.guard}><td>{r.guard === "day" ? "Día" : r.guard === "night" ? "Noche" : "Total"}</td><td>{fmt(r.advanceM)} m</td><td>{fmt(r.drillingHours)} h</td><td>{fmt(r.ropMPerHour)} m/h</td><td>{r.positions-r.excludedKeys.length}/{r.positions} posiciones</td></tr>)}</tbody></table><FormulaInfo title="Cómo se calcula la ROP total"><p>Σ metros de pares válidos / Σ horas de esos mismos pares. No es suma ni promedio simple de ROP de día y noche. Se conserva la regla operacional: metros y horas conocidos, con horas positivas o avance cero; si la suma de horas es cero no hay ROP.</p>{rows.map(r=><p key={r.guard}>{r.guard === "total" ? "Total" : r.guard === "day" ? "Día" : "Noche"}: {fmt(r.pairedMetres)} m / {fmt(r.pairedHours)} h = {fmt(r.ropMPerHour)} m/h. Faltan {r.missingAdvance} avances y {r.missingHours} horas. Excluidos del par: {r.excludedKeys.join(", ") || "ninguno"}.</p>)}</FormulaInfo></section>;
}
