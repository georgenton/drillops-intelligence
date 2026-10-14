"use client";

import { useState } from "react";
import { predictRop, ROP_MODEL_VERSION, scenario, twoPointDecay } from "@/packages/domain/rop-model";

/** Deliberately independent of operational data: explicit hypothetical inputs,
 * never defaults inferred from a shift average or an unconfirmed UCS. */
export type ScenarioAssumptions={r0:number;r1:number;elapsed:number;horizon:number;threshold:number;ucs:number|null;ucsSource:string};
export function RopScenario({onAttach}:{onAttach?:(assumptions:ScenarioAssumptions)=>void}) {
  const [r0, setR0] = useState("4");
  const [r1, setR1] = useState("0.5");
  const [elapsed, setElapsed] = useState("2");
  const [horizon, setHorizon] = useState("2");
  const [threshold, setThreshold] = useState("0.25");
  const [ucs, setUcs] = useState("");
  const [source, setSource] = useState("");
  let output: ReturnType<typeof scenario> | null = null;
  let estimate: ReturnType<typeof twoPointDecay> | null = null;
  let error = "";
  try {
    if ([r0, r1, elapsed, horizon, threshold].some(v => !v.trim())) throw new Error("Completa los campos numéricos; vacío no equivale a cero.");
    estimate = twoPointDecay(Number(r0), Number(r1), Number(elapsed), ucs.trim() ? { valueMpa: Number(ucs), source, independentlyMeasured: true } : null);
    if (estimate.trend === "IMPROVING_NOT_POLISHING") error = "Tendencia creciente: mejoría, no pulido negativo. No extrapolamos una ley de decaimiento.";
    else output = scenario({ ropNow: Number(r1), beta: estimate.betaPerHour, horizonHours: Number(horizon), threshold: Number(threshold) });
  } catch (cause) { error = cause instanceof Error ? cause.message : "Datos inválidos"; }
  const fields = [
    ["ROP instantánea inicial (m/h)", r0, setR0], ["ROP instantánea actual (m/h)", r1, setR1],
    ["Tiempo efectivo entre puntos (h)", elapsed, setElapsed], ["Horizonte futuro efectivo (h, máximo 168)", horizon, setHorizon],
    ["Umbral de desempeño (m/h)", threshold, setThreshold], ["UCS independiente (MPa, opcional)", ucs, setUcs],
  ] as const;
  const format = (value: number) => new Intl.NumberFormat("es-EC", { maximumFractionDigits: 6 }).format(value);
  const curve = output && estimate ? Array.from({ length: 41 }, (_, index) => {
    const hours = Number(horizon) * index / 40;
    const rate = predictRop(Number(r1), estimate.betaPerHour, hours);
    return `${50 + index * 12},${160 - rate / Number(r1) * 130}`;
  }).join(" ") : "";
  return <section className="panel" aria-labelledby="rop-scenario-title">
    <h3 id="rop-scenario-title">Escenario hipotético de ROP</h3>
    <p>Calculadora didáctica — {ROP_MODEL_VERSION}. Los valores iniciales son un ejemplo, no una calibración del cliente. Usa puntos instantáneos comparables, no promedios de turno.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBlock: 16 }}>
      {fields.map(([label, value, setter]) => <label key={label} style={{ display: "grid", gap: 6 }}>{label}<input type="number" min="0" step="any" value={value} onChange={event => setter(event.target.value)} /></label>)}
      <label style={{ display: "grid", gap: 6 }}>Fuente independiente de UCS (ensayo / medición)<input value={source} onChange={event => setSource(event.target.value)} placeholder="Sin fuente: α no disponible" /></label>
    </div>
    {error && <p role="alert">{error}</p>}
    {estimate && <p>β: {format(estimate.betaPerHour)} h⁻¹ · α: {estimate.alphaPerMpaHour === null ? `No disponible (${estimate.alphaStatus})` : `${format(estimate.alphaPerMpaHour)} MPa⁻¹·h⁻¹`}</p>}
    {output && <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
      <div><dt>ROP al final del horizonte</dt><dd>{format(output.futureRop)} m/h</dd></div>
      <div><dt>Avance futuro integrado</dt><dd>{format(output.metres)} m</dd></div>
      <div><dt>Tiempo a umbral, no vida restante</dt><dd>{output.thresholdHours === null ? "Sin cruce previsto" : `${format(output.thresholdHours)} h efectivas`}</dd></div>
    </dl>}
    {output && <figure style={{ margin: "16px 0" }}>
      <svg viewBox="0 0 580 200" role="img" aria-label={`Escenario hipotético: ROP desde ${r1} hasta ${format(output.futureRop)} metros por hora durante ${horizon} horas efectivas`} style={{ width: "100%", maxHeight: 240 }}>
        <path d="M50 20V160H540" fill="none" stroke="currentColor" opacity="0.4" />
        <polyline points={curve} fill="none" stroke="#a3e635" strokeWidth="3" />
        <text x="50" y="185" fill="currentColor" fontSize="12">0 h</text>
        <text x="480" y="185" fill="currentColor" fontSize="12">{horizon} h</text>
        <text x="50" y="15" fill="currentColor" fontSize="12">ROP (m/h) · simulación, no observaciones</text>
      </svg>
      <figcaption>Curva de velocidad hipotética; el avance mostrado es el área integrada, no ROP final × horas.</figcaption>
    </figure>}
    <p>Supuestos: misma corona, régimen y roca durante el horizonte; β constante. Extrapolación no validada físicamente. La caída de ROP no mide desgaste ni altura de matriz y no prescribe cargas, RPM o reafilado.</p>
    {onAttach&&<button type="button" disabled={Boolean(error)||!output} onClick={()=>onAttach({r0:Number(r0),r1:Number(r1),elapsed:Number(elapsed),horizon:Number(horizon),threshold:Number(threshold),ucs:ucs.trim()?Number(ucs):null,ucsSource:source})}>Adjuntar este escenario a la decisión</button>}
  </section>;
}
