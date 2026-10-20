"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Download, ShieldCheck, Sparkles } from "lucide-react";
import { depthTrackSegments, validDepthRange, type DepthTrack } from "@/packages/domain/depth-display";
import { reconstructCrownHistory } from "@/packages/domain/crown-history";
import { mseAnnularMpa } from "@/packages/domain/rop-model";
import { EChart } from "./echart";
import { FormulaInfo } from "./formula-info";
import { useOperationalCatalog } from "./operational-catalog";
import { crownFmt as fmt, type CrownViewProps } from "./recovered-crowns";
const tracks:DepthTrack[]=["rop","pressure","torque","rpm","recovery","mse","hardness"];
const labels={rop:"ROP",pressure:"Presión",torque:"Torque",rpm:"RPM",recovery:"Recup.",mse:"MSE",hardness:"Mohs"};
const units={rop:"m/h",pressure:"PSI · pulldown",torque:"unidad no confirmada",rpm:"rpm",recovery:"% · sin medición",mse:"MPa",hardness:"1–10 · sin declaración"};
const colors={rop:"#d7ff43",pressure:"#56c7ff",torque:"#ff9f43",rpm:"#bd8cff",recovery:"#41d6a3",mse:"#ff6969",hardness:"#ffcc66"};
export function RecoveredDepth({data}:CrownViewProps){
 const {catalog}=useOperationalCatalog();
 const [requestedHole,setHole]=useState(""),[visible,setVisible]=useState<Record<DepthTrack,boolean>>({rop:true,pressure:true,torque:true,rpm:true,recovery:true,mse:true,hardness:true}),[window,setWindow]=useState("all");
 // A changed server filter may remove the locally selected hole. Derive a valid
 // selection immediately instead of showing stale rows from the previous context.
 const hole=data.summary.holes.includes(requestedHole)?requestedHole:data.filters.hole&&data.summary.holes.includes(data.filters.hole)?data.filters.hole:data.summary.holes[0]??"";
 const allRows=data.shifts.filter(s=>s.holeCode===hole),valid=allRows.filter(validDepthRange);
 const low=valid.length?Math.min(...valid.map(s=>s.startDepthM!)):null,high=valid.length?Math.max(...valid.map(s=>s.endDepthM!)):null;
 const lower=window==="last100"&&high!==null?Math.max(low??0,high-100):low;
 const rows=valid.filter(s=>lower===null||s.endDepthM!>=lower);
 const history=reconstructCrownHistory(data.crowns.filter(c=>c.holeCode===hole),allRows);
 const measured=(catalog?.crowns??[]).flatMap(c=>{const m=c.mseCalibration;if(!m||m.holeCode!==hole||data.filters.rig&&m.rigCode!==data.filters.rig||data.filters.from&&m.date<data.filters.from||data.filters.to&&m.date>data.filters.to||lower!==null&&m.depthM<lower||high!==null&&m.depthM>high)return [];const result=mseAnnularMpa(m);return result.value===null?[]:[{code:c.code,measurement:m,value:result.value}];});
 const paired=rows.filter(s=>s.advanceM!==null&&s.drillingHours!==null&&s.drillingHours>0),hours=paired.reduce((s,r)=>s+r.drillingHours!,0);
 const rop=hours>0?paired.reduce((s,r)=>s+r.advanceM!,0)/hours:null;
 const active=tracks.filter(t=>visible[t]);
 const option={animation:false,backgroundColor:"transparent",title:active.map((t,i)=>({text:labels[t],subtext:units[t],left:`${5+i*90/active.length}%`,top:4,textStyle:{fontSize:12,color:"#eef3f5"},subtextStyle:{fontSize:8,color:"#91a0a8"}})),
  tooltip:{trigger:"item",backgroundColor:"#11191e",borderColor:"#344149",textStyle:{color:"#eef3f5"}},axisPointer:{link:[{yAxisIndex:"all"}]},
  grid:active.map((_,i)=>({left:`${5+i*90/active.length}%`,width:`${Math.max(4,84/active.length)}%`,top:62,bottom:30})),
  xAxis:active.map((_,i)=>({type:"value",gridIndex:i,position:"top",splitNumber:2,axisLabel:{color:"#91a0a8",fontSize:8,hideOverlap:true},axisLine:{lineStyle:{color:"#344149"}},splitLine:{lineStyle:{color:"#202a30"}}})),
  yAxis:active.map((_,i)=>({type:"value",gridIndex:i,inverse:true,min:lower??0,max:high??1,axisLabel:{show:i===0,color:"#91a0a8",formatter:"{value} m",fontSize:9},axisLine:{show:i===0,lineStyle:{color:"#45525a"}},splitLine:{lineStyle:{color:"#263139",type:"dashed"}}})),
  dataZoom:[{type:"inside",yAxisIndex:active.map((_,i)=>i),filterMode:"none"},{type:"slider",yAxisIndex:active.map((_,i)=>i),right:4,width:12,filterMode:"none",borderColor:"#2b363d",fillerColor:"rgba(215,255,67,.16)"}],
  series:active.flatMap<Record<string,unknown>>((track,i)=>track==="mse"?[{name:"MSE medida · punto independiente",type:"scatter",xAxisIndex:i,yAxisIndex:i,symbolSize:8,itemStyle:{color:colors.mse},data:measured.map(m=>({name:`${m.code} · ${m.measurement.date}`,value:[m.value,m.measurement.depthM]}))}]:depthTrackSegments(rows,track).map(s=>({name:`${labels[track]} · ${s.rig} · promedio del rango real`,type:"line",xAxisIndex:i,yAxisIndex:i,showSymbol:false,smooth:false,connectNulls:false,lineStyle:{color:colors[track],width:2},itemStyle:{color:colors[track]},data:s.points})))};
 const bands=history.attributions.flatMap(a=>{const row=rows.find(r=>r.logicalKey===a.shiftKey),run=history.runs.find(r=>r.id===a.runId);return a.status==="CONFIRMED_DEPTH_COVERAGE"&&row&&run&&lower!==null&&high!==null&&high>lower?[{key:a.shiftKey,label:run.serial??"Sin serie",start:Math.max(lower,row.startDepthM!),end:Math.min(high,row.endDepthM!)}]:[];});
 const query=new URLSearchParams({...data.filters,hole}).toString();
 return <><div className="depth-toolbar"><div><label>Sondeo<select aria-label="Sondeo de profundidad" value={hole} onChange={e=>{setHole(e.target.value);setWindow("all");}}>{data.summary.holes.map(h=><option key={h}>{h}</option>)}</select></label><label>Rango<select aria-label="Rango de profundidad" value={window} onChange={e=>setWindow(e.target.value)}><option value="all">{fmt(low)}–{fmt(high)} m · completo</option><option value="last100">Últimos 100 m observados</option></select></label></div><div className="legend-inline"><span><i className="event-line"/>Cobertura de corona confirmada</span><a className="button-link" href={`/api/v2/export?${query}`}><Download size={12}/>Exportar XLSX</a></div></div>
 <div className="depth-summary"><div><b>{fmt(lower!==null&&high!==null?high-lower:null)} m</b><span>rango visible</span></div><div><b>{fmt(rop)} m/h</b><span>ROP ponderado</span></div><div><b>{fmt(measured.length?measured.reduce((s,m)=>s+m.value,0)/measured.length:null)} MPa</b><span>{measured.length} mediciones MSE puntuales</span></div><div><b>—</b><span>recuperación no medida</span></div><div className="warn"><b>—</b><span>anomalías sin regla calibrada</span></div><div><b>{history.runs.length}</b><span>corridas reconstruidas</span></div></div>
 <section className="depth-layout"><aside className="track-panel"><h3>Pistas</h3><p>Activa las variables disponibles.</p>{tracks.map(t=><label key={t}><input type="checkbox" checked={visible[t]} onChange={()=>setVisible(v=>({...v,[t]:!v[t]}))}/><i className={`track-color ${t}`}/><span>{labels[t]}<small>{units[t]}</small></span></label>)}<hr/><div className="source-note"><ShieldCheck/><div><b>Fuente de datos</b><span>Rangos de turnos y mediciones explícitas</span></div></div></aside>
 <section className="panel depth-chart-panel"><div className="depth-ruler-note">PROFUNDIDAD ↓</div>{active.length>0&&valid.length>0?<EChart option={option} className="depth-chart" ariaLabel="Variables operacionales sincronizadas por profundidad; medias por rango, sin interpolación"/>:<p style={{padding:40}}>Selecciona una pista y un sondeo con rangos válidos. No se rellenan faltantes.</p>}<div className="bit-bands">{bands.map(b=><span key={b.key} title={`${b.label}: ${b.start}–${b.end} m atribuibles`} style={{top:`${(b.start-lower!)/(high!-lower!)*100}%`,height:`${(b.end-b.start)/(high!-lower!)*100}%`,overflow:"hidden"}}>{b.label}</span>)}</div></section>
 <aside className="depth-events"><h3>Eventos y observaciones</h3>{history.runs.map(r=><div key={r.id}><i/><small>{fmt(r.startDepthM)}–{fmt(r.endDepthM)} m</small><b>{r.serial??"Serie no informada"}</b><span>{r.firstObservedDate} — {r.lastObservedDate} · extremos reportados, no cambio confirmado</span></div>)}</aside></section>
 <div className="depth-insight"><Sparkles/><div><b>Lectura operacional + geología declarada</b><p>Se mantiene cada promedio en su rango real. Se unen sólo rangos adyacentes del mismo equipo; huecos y solapamientos no se suavizan. No son lecturas cada 3 m ni evidencia de desgaste.</p></div><Link href={`/bit-advisor?${query}`}>Abrir Bit Advisor<ChevronRight/></Link></div>
 <FormulaInfo title="Discontinuidades y alcance de las pistas"><p>{allRows.length-valid.length} posiciones sin rango positivo válido; {valid.length} rangos válidos. Las interrupciones restantes corresponden a huecos, solapamientos o mediciones ausentes. ROP usa avance y horas del mismo turno. Las bandas muestran solamente cobertura única atribuida; no representan vida útil ni una instalación confirmada.</p><p>Presión conserva PSI; no se convierte a bar. Torque no se convierte a N·m sin unidad. MSE sólo aparece como punto independiente con medición, geometría y unidades confirmadas; no se extrapola a toda una corrida. Recuperación y Mohs permanecen vacíos si no se midieron/declararon.</p></FormulaInfo>
 </>;
}
