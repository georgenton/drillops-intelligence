"use client";

import Link from "next/link";
import { useState } from "react";
import type { OperationalReport } from "@/packages/import/types";
import { calculateSurveyTrajectory, type SurveyConfiguration } from "@/packages/domain/survey-trajectory";
import type { RecoveredData } from "./recovered-operational-views";
import { EChart } from "./echart";
import { Trajectory3D } from "./trajectory-3d";
import { useOperationalCatalog } from "./operational-catalog";
import type { PrivateSession } from "@/lib/private-auth";
import { canAccessSection } from "@/lib/access-control";
import { useReviewScenario,ReviewMark } from "./review-scenario";
import type { ReviewSurvey } from "@/packages/domain/review-survey";

const northLabels = { true_north: "norte verdadero", magnetic_north: "norte magnético (sin corrección)", grid_north: "norte de cuadrícula" };
const syntheticConfiguration: SurveyConfiguration = { angleConvention: "inclination_from_vertical", azimuthReference: "true_north", method: "minimum_curvature", anchor: { depthM: 0, eastM: 0, northM: 0, tvdM: 0 }, evidence: "Ensayo sintético independiente del cliente" };
const syntheticTrajectory = calculateSurveyTrajectory([0, 30, 60, 90].map((depthM, i) => ({ depthM, dip: i * 10, azimuth: 40, valid: true })), syntheticConfiguration);
const display = (n: number | null) => n === null ? "—" : n.toLocaleString("es-EC", { maximumFractionDigits: 2 });

/** Original Survey presentation, supplied only with tenant-scoped measurements.
 * Catalog configuration may also be passed explicitly while the parent loads it.
 */
export function RecoveredSurvey({ data, configuration, session }: { data: RecoveredData; configuration?: SurveyConfiguration | null;session?:PrivateSession }) {
  const { catalog, error: catalogError } = useOperationalCatalog();
  const review=useReviewScenario();
  const scenarioSurveys=(review.scenario as {surveys?:ReviewSurvey[]}|null)?.surveys??[];
  const scopedSurveys=scenarioSurveys.filter(s=>(!data.filters.rig||s.rigCode===data.filters.rig.trim().toUpperCase())&&(!data.filters.hole||s.holeCode===data.filters.hole.trim().toUpperCase()));
  const reports = (data as RecoveredData & { reports?: OperationalReport[] }).reports ?? [];
  const context=(r:OperationalReport)=>`${r.rigCode.trim().toUpperCase()} · ${r.holeCode?.trim().toUpperCase() ?? "Sin sondeo"}`;
  const contexts = [...new Set([...reports.filter(r => r.survey.length).map(context),...(review.enabled?scopedSurveys.map(s=>`${s.rigCode} · ${s.holeCode??"Sin sondeo"}`):[])])];
  const [selected, setSelected] = useState(""), [view, setView] = useState<"2d" | "3d">("3d"), [synthetic, setSynthetic] = useState(false), [page, setPage] = useState(1);
  const active = contexts.includes(selected) ? selected : contexts[0];
  const selectedReports = reports.filter(r => context(r) === active);
  const reviewSurvey=review.enabled?scopedSurveys.find(s=>`${s.rigCode} · ${s.holeCode??"Sin sondeo"}`===active):undefined;
  const firstReport = selectedReports[0];
  const rows = selectedReports.flatMap(report => report.survey.map(station => ({ ...station, report })));
  const config = configuration ?? catalog?.holes?.find(h => h.code === firstReport?.holeCode?.trim().toUpperCase() && h.rigCode === firstReport?.rigCode.trim().toUpperCase())?.surveyConfiguration;
  const trajectory = calculateSurveyTrajectory(rows, config);
  const profileRows = reviewSurvey?.stations??[...new Map(rows.filter(r => r.valid && r.depthM !== null && r.dip !== null && r.azimuth !== null).map(r => [`${r.depthM}|${r.dip}|${r.azimuth}`, r])).values()].sort((a, b) => a.depthM! - b.depthM!);
  const option = (() => {
    const seriesData = (key: "dip" | "azimuth") => profileRows.flatMap((r, i) => {
      const previous = profileRows[i - 1];
      // Break angular wrap and contradictory same-depth measurements; never smooth.
      const breakLine = previous && (previous.depthM === r.depthM || (key === "azimuth" && Math.abs(r.azimuth! - previous.azimuth!) > 180));
      return [...(breakLine ? [[null, null]] : []), [r[key], r.depthM]];
    });
    return {
      tooltip: { trigger: "item" }, grid: [{ left: 55, right: "54%", top: 24, bottom: 52 }, { left: "56%", right: 25, top: 24, bottom: 52 }],
      xAxis: [reviewSurvey?.classification==="SINTETICO"?"DIP simulado (°)":"DIP observado (°)", reviewSurvey?.classification==="SINTETICO"?"Azimut simulado (°)":"Azimut observado (°)"].map((name, gridIndex) => ({ type: "value", gridIndex, name, nameLocation: "middle", nameGap: 28, axisLabel: { color: "#89949d" }, splitLine: { lineStyle: { color: "#20292f" } } })),
      yAxis: [0, 1].map(gridIndex => ({ type: "value", gridIndex, inverse: true, name: "MD (m)", axisLabel: { color: "#89949d" }, splitLine: { lineStyle: { color: "#20292f" } } })),
      series: (["dip", "azimuth"] as const).map((key, index) => ({ name: index ? "Azimut (°) / MD (m)" : "DIP (°) / MD (m)", type: "line", xAxisIndex: index, yAxisIndex: index, smooth: false, connectNulls: false, symbolSize: 6, data: seriesData(key), itemStyle: { color: index ? "#41d6a3" : "#56c7ff" } })),
    };
  })();
  const pages = Math.max(1, Math.ceil(rows.length / 24)), currentPage = Math.min(page, pages);
  return <>
    <div className="actionbar survey-actions">
      <label>Sondeo <select aria-label="Sondeo Survey" value={active ?? ""} onChange={e => { setSelected(e.target.value); setSynthetic(false); setPage(1); }}>{contexts.length ? contexts.map(c => <option key={c}>{c}</option>) : <option value="">Sin estaciones registradas</option>}</select></label>
      <span className="badge">{profileRows.length} estaciones distintas</span>
      {reviewSurvey&&<ReviewMark simulated={reviewSurvey.classification==="SINTETICO"}/>}
      <div className="view-switch"><button className={view === "2d" ? "active" : ""} aria-pressed={view === "2d"} onClick={() => { setView("2d"); setSynthetic(false); }}>Perfil 2D</button><button className={view === "3d" ? "active" : ""} aria-pressed={view === "3d"} onClick={() => setView("3d")}>Trayectoria 3D</button></div>
      {session&&!session.demo&&canAccessSection({...session,section:"importaciones"})&&<Link className="secondary-btn" href="/importaciones">Importar estaciones</Link>}
    </div>
    {catalogError && <p role="alert">{catalogError} No se habilita una trayectoria sin configuración confirmada.</p>}
    <section className="panel survey-visual">
      <header className="panel-head"><div><h3>Survey direccional · {reviewSurvey?.context??active??"Sin datos"}</h3><p>{reviewSurvey?`${reviewSurvey.inputClassification} · misma reconstrucción en 2D y 3D · ejes relativos`:(view === "2d" ? "DIP y azimut originales contra profundidad medida; segmentos visuales entre observaciones, sin suavizado." : "Visor original · proyección rotatoria E–N / TVD. Sin extrapolación al collar.")}</p></div></header>
      {view === "2d" ? profileRows.length ? <EChart className="chart survey-chart" ariaLabel="Perfiles observados DIP y azimut por profundidad" option={option}/> : <p className="source-note">No hay pares completos de profundidad, DIP y azimut en el alcance seleccionado.</p>
        : reviewSurvey?<Trajectory3D survey={[]} trajectoryPoints={reviewSurvey.points} holeCode={reviewSurvey.context} originLabel={`ANCLA RELATIVA · ${reviewSurvey.configuration.anchor.depthM} m MD`} methodLabel={`Curvatura mínima · ${reviewSurvey.configuration.azimuthReference==="nominal_unverified"?"azimut nominal no verificado":northLabels[reviewSurvey.configuration.azimuthReference]} · ${reviewSurvey.classification==="SINTETICO"?"simulado":"estimado"}`}/>
        : synthetic ? <><p className="source-note">ENSAYO SINTÉTICO AISLADO · No representa este sondeo ni utiliza sus mediciones.</p><Trajectory3D survey={[]} trajectoryPoints={syntheticTrajectory.points} holeCode="ENSAYO SINTÉTICO" originLabel="ANCLA SINTÉTICA · 0 m" methodLabel="Curvatura mínima · convención sintética declarada"/><button onClick={() => setSynthetic(false)}>Volver al Survey real</button></>
        : trajectory.status === "ready" ? <Trajectory3D survey={[]} trajectoryPoints={trajectory.points} holeCode={active ?? ""} originLabel={`ANCLA · ${config!.anchor.depthM} m MD`} methodLabel={`Curvatura mínima · ${northLabels[config!.azimuthReference]} · sin validación física independiente`}/>
        : <div className="source-note" style={{ minHeight: 340, padding: 28 }}><div><h3>Trayectoria real pendiente de confirmación</h3>{trajectory.reasons.map(reason => <p key={reason}>{reason}</p>)}<p>En la ficha de Sondeos, una persona autorizada debe registrar convención angular, norte, anclaje y evidencia. Si hay lecturas contradictorias, corrija primero la fuente y vuelva a importarla. El perfil 2D y las estaciones originales siguen disponibles.</p><Link href="/sondeos">Revisar ficha del sondeo</Link><p><button className="button secondary" onClick={() => setSynthetic(true)}>Probar visor con ensayo sintético aislado</button></p></div></div>}
      <details style={{ padding: 18 }}><summary>Cómo se calcula y qué falta confirmar</summary><p>Curvatura mínima integra las direcciones entre estaciones como arcos; usa MD, no profundidad vertical como distancia perforada. DIP negativo descendente: inclinación = 90° + DIP; DIP positivo descendente: inclinación = 90° − DIP. No se aplica corrección de declinación ni conversión a coordenadas geográficas.</p><p>Un anclaje local explícito no prueba coordenadas topográficas. Los valores E/N/TVD son relativos al origen declarado. La polilínea une estaciones calculadas; no muestra mediciones intermedias.</p>{reviewSurvey?<><p>{reviewSurvey.reason}</p><p>{reviewSurvey.configuration.evidence}</p><p>{reviewSurvey.acceptedCount} lecturas seleccionadas de {reviewSurvey.sourceCount}; {reviewSurvey.discardedCount} duplicadas, contradictorias o inválidas excluidas sólo de la reconstrucción.</p><p>{reviewSurvey.confirm}</p></>:<>{config && <p>Evidencia declarada: {config.evidence}. Anclaje MD {config.anchor.depthM} m; E {config.anchor.eastM} m; N {config.anchor.northM} m; TVD {config.anchor.tvdM} m.</p>}<p>{trajectory.duplicates} observaciones idénticas deduplicadas para el cálculo. Todas las filas de origen se conservan debajo.</p></>}</details>
      {reviewSurvey&&<details style={{padding:18}}><summary>Estaciones usadas en esta reconstrucción · {reviewSurvey.classification}</summary><table><thead><tr><th>MD m</th><th>DIP °</th><th>Azimut °</th><th>Origen activo</th></tr></thead><tbody>{reviewSurvey.stations.map(s=><tr key={s.depthM}><td>{s.depthM}</td><td>{s.dip}</td><td>{s.azimuth}</td><td>{s.source?`${s.source.file} / ${s.source.sheet}`:"Referencia sintética separada"}</td></tr>)}</tbody></table></details>}
    </section>
    <section className="panel"><header className="panel-head"><div><h3>Estaciones y trazabilidad</h3><p>Datos originales, incluidos inválidos y repetidos. Sin inversión automática del signo DIP.</p></div></header><div style={{ overflowX: "auto" }}><table><thead><tr><th>MD m</th><th>DIP °</th><th>Azimut °</th><th>Referencia / equipo</th><th>Fuente y celdas</th><th>Calidad</th></tr></thead><tbody>{rows.slice((currentPage - 1) * 24, currentPage * 24).map((r, i) => <tr key={`${r.report.key}:${r.key}:${i}`}><td>{display(r.depthM)}</td><td>{display(r.dip)}</td><td>{display(r.azimuth)}</td><td>{r.reference ?? "Sin confirmar"}<br/>{r.equipment ?? "No registrado"}</td><td>{r.report.source.file} · {r.report.source.sheet}<br/>{Object.entries(r.cells).map(([key, cell]) => `${key}: ${cell.cell}`).join(" · ")}</td><td>{r.valid ? "Lectura disponible" : "Revisar fuente"}{r.warnings.length ? ` · ${r.warnings.join(", ")}` : ""}</td></tr>)}</tbody></table></div><div className="pagination"><span>{rows.length} filas · página {currentPage} de {pages}</span><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</button><button disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Siguiente</button></div></section>
  </>;
}
