"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDollarSign, Gauge, HelpCircle, ShieldCheck, Sparkles, Zap } from "lucide-react";
import type { AdvisorInput, Level, Priority } from "@/packages/domain/types";
import { ORIGINAL_ADVISOR_WEIGHTS, privateAdvisorRanking, type PrivateAdvisorProduct } from "@/packages/domain/private-advisor";
import { reconstructCrownHistory, compareCrownHistory } from "@/packages/domain/crown-history";
import { canViewOperationalCosts,canAccessSection } from "@/lib/access-control";
import { useInventory } from "./recovered-inventory";
import { geologyReference, geologyReferenceVersion } from "@/lib/geology-reference";
import { useOperationalCatalog } from "./operational-catalog";
import { RecoveredDecisionPanel } from "./recovered-controls";
import { CrownHistoryEvidence, crownProducts, crownFmt, type CrownViewProps } from "./recovered-crowns";
import { FormulaInfo } from "./formula-info";

const priorities:Record<Priority,string>={speed:"Mayor avance",cost:"Menor costo",life:"Mayor vida",balanced:"Equilibrada"};
const factorNames=["Compatibilidad","Costo","ROP","Vida","Inventario"];
export function RecoveredAdvisor({data,session,reload}:CrownViewProps){
 const {catalog}=useOperationalCatalog();
 const inventory=useInventory(canAccessSection({...session,section:"inventario"}));
 const [hole,setHole]=useState(""),[rig,setRig]=useState(""),[diameter,setDiameter]=useState<AdvisorInput["diameter"]|"">(""),[previous,setPrevious]=useState(""),[wear,setWear]=useState<number|null>(null);
 const [hardness,setHardness]=useState<number|null>(null),[fracturing,setFracturing]=useState<Level|"">(""),[abrasivity,setAbrasivity]=useState<Level|"">(""),[water,setWater]=useState<AdvisorInput["waterReturn"]|"">("");
 const [priority,setPriority]=useState<Priority>("balanced"),[ran,setRan]=useState(false),[selected,setSelected]=useState(""),[method,setMethod]=useState(false),[showAll,setShowAll]=useState(false);
 const showCosts=canViewOperationalCosts(session.role);
 const shifts=data.shifts.filter(s=>(!hole||s.holeCode===hole)&&(!rig||s.rigCode===rig));
 const crowns=data.crowns.filter(c=>(!hole||c.holeCode===hole)&&(!rig||c.rigCode===rig));
 const history=reconstructCrownHistory(crowns,shifts);
 const configured=crownProducts({...data,shifts,crowns},catalog?.crowns??[],inventory.snapshot?.balances);
 const unconfigured=compareCrownHistory({...history,runs:history.runs.filter(r=>!configured.some(p=>p.id===r.serial?.toUpperCase()))});
 const products:PrivateAdvisorProduct[]=[...configured,...unconfigured.map((r,i)=>({id:`observed-${i}`,manufacturer:r.brand??"Marca no informada",product:r.type??"Tipo no informado",matrix:null,diameter:null,price:null,stock:null,reserved:null,reorder:null,historicalRop:r.ropMPerHour,historicalCost:null,historicalLife:null,observations:r.attributedShiftCount,hardnessFit:null,fracturingFit:null}))];
 const contextReady=Boolean(hole&&rig&&diameter&&hardness!==null&&fracturing);
 const ranking=privateAdvisorRanking(products,{tenantId:session.tenantId,diameter:diameter||"HQ",hardness:hardness??3,fracturing:fracturing||"medium",abrasivity:abrasivity||"medium",waterReturn:water||"partial",priority},showCosts);
 const resultMap=new Map(contextReady&&ran?ranking.results.map(r=>[r.crown.id,r]):[]);
 const ordered=resultMap.size?ranking.results.map(r=>products.find(p=>p.id===r.crown.id)!):products;
 const eligible=history.runs.filter(r=>r.ropMPerHour!==null&&r.shiftKeys.length>=2&&r.type&&r.serial&&r.holeCode);
 const sameContext=new Set(history.runs.map(r=>r.rigCode)).size===1&&new Set(history.runs.map(r=>r.holeCode)).size===1&&history.runs.every(r=>r.holeCode);
 const candidate=sameContext&&eligible.length>0&&new Set(eligible.map(r=>r.type)).size===1?[...eligible].sort((a,b)=>(b.ropMPerHour??0)-(a.ropMPerHour??0))[0]:undefined;
 const reset=()=>{setRan(false);setSelected("");};
 return <><div className="advisor-layout">
 <section className="panel advisor-form">
  <div className="advisor-step"><i>1</i><div><h3>Contexto operacional</h3><p>Describe el siguiente tramo a perforar.</p></div></div>
  <label>Sondeo<select value={hole} onChange={e=>{setHole(e.target.value);reset();}}><option value="">Seleccionar sondeo</option>{data.summary.holes.map(h=><option key={h}>{h}</option>)}</select></label>
  <div className="form-row"><label>Taladro<select value={rig} onChange={e=>{setRig(e.target.value);reset();}}><option value="">Seleccionar taladro</option>{data.summary.rigs.map(r=><option key={r}>{r}</option>)}</select></label><label>Diámetro<select value={diameter} onChange={e=>{setDiameter(e.target.value as typeof diameter);reset();}}><option value="">Declarar</option><option>HQ</option><option>NQ</option><option>PQ</option></select></label></div>
  <label>Corona anterior<select value={previous} onChange={e=>{setPrevious(e.target.value);setWear(null);reset();}}><option value="">Seleccionar observada</option>{[...new Set(crowns.map(c=>c.serial).filter(Boolean))].map(s=><option key={s!}>{s}</option>)}</select></label>
  <div className="wear-row"><label>Desgaste anterior<b>{wear===null?"Sin medición":`${wear}% declarado`}</b></label><input aria-label="Desgaste anterior declarado" type="range" min="0" max="100" value={wear??0} onChange={e=>setWear(Number(e.target.value))}/><span>Entrada local opcional; no inferida de ROP ni metros</span></div>
  <hr/><div className="advisor-step"><i>2</i><div><h3>Condición percibida</h3><p>Dureza operacional + evidencia geológica declarada.</p></div></div>
  <div className="advisor-evidence"><span><small>MSE calculada</small><b>Ver mediciones en Coronas</b></span><span><small>Mohs declarada</small><b>No incorporada</b></span><span><small>Litología</small><b>No declarada</b></span></div>
  <details className="geology-reference"><summary>Tabla geológica básica · {geologyReferenceVersion}</summary>{geologyReference.map(row=><div key={row.lithology}><b>{row.lithology}</b><span>{row.typicalMinerals}</span><small>Mohs mineral orientativa {row.mineralMohsRange} · {row.note}</small></div>)}</details>
  <label>Dureza operacional <b>{hardness===null?"Sin declarar":`${hardness}/5`}</b><input aria-label="Dureza operacional" type="range" min="1" max="5" value={hardness??3} onChange={e=>{setHardness(Number(e.target.value));reset();}}/><div className="range-labels"><span>Blanda</span><span>Muy dura</span></div></label>
  <div className="form-row"><label>Fracturación<select value={fracturing} onChange={e=>{setFracturing(e.target.value as Level|"");reset();}}><option value="">Declarar</option><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></select></label><label>Abrasividad<select value={abrasivity} onChange={e=>setAbrasivity(e.target.value as Level|"")}><option value="">Declarar</option><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></select></label></div>
  <label>Retorno de agua<select value={water} onChange={e=>setWater(e.target.value as typeof water)}><option value="">Declarar</option><option value="complete">Completo</option><option value="partial">Parcial</option><option value="lost">Perdido</option></select></label>
  <FormulaInfo title="Qué controla cada entrada"><p>Diámetro filtra productos. Dureza 1–5 y fracturación calculan compatibilidad: 65% dureza + 35% fracturación. No son Mohs ni UCS. Abrasividad, retorno y desgaste anterior eran controles contextuales del original; no intervienen en su fórmula. Aquí quedan como entradas locales, sin efecto numérico ni guardado automático.</p><p>El ranking no usa alfa ni beta. La calculadora V2 de abajo usa ROP instantáneas y tiempo efectivo; realiza otra función.</p></FormulaInfo>
  <hr/><div className="advisor-step"><i>3</i><div><h3>Prioridad de decisión</h3><p>El ranking cambia con el objetivo.</p></div></div>
  <div className="priority-grid">{(["speed",...(showCosts?["cost" as const]:[]),"life","balanced"] as Priority[]).map(p=><button type="button" key={p} className={priority===p?"active":""} onClick={()=>{setPriority(p);reset();}}>{p==="speed"?<Zap/>:p==="cost"?<CircleDollarSign/>:p==="life"?<ShieldCheck/>:<Gauge/>}<b>{priorities[p]}</b><small>{p==="speed"?"Maximizar ROP":p==="cost"?"Minimizar USD/m":p==="life"?"Maximizar metros":"Balance total"}</small></button>)}</div>
  <button className="primary-btn run-advisor" onClick={()=>setRan(true)}><Sparkles/>Generar recomendación</button>
 </section>
 <section className="advisor-results"><div className="advisor-result-head"><div><span className="demo-pill"><i/>MOTOR DETERMINÍSTICO</span><h2>Recomendaciones para {priorities[priority].toLowerCase()}</h2><p>Catálogo real y cobertura histórica del contexto autorizado.</p></div><button aria-expanded={method} onClick={()=>setMethod(!method)}><HelpCircle/>{method?"Ocultar cálculo":"Cómo se calcula"}</button></div>
 {method&&<div className="method-note" role="status"><ShieldCheck/><div><b>Ranking original, pesos sin cambios</b><p>{factorNames.map((n,i)=>`${n} ${ORIGINAL_ADVISOR_WEIGHTS[priority][i]*100}%`).join(" · ")}</p><p>Puntaje = 100 × suma de factores normalizados por sus pesos. ROP, costo y vida usan mínimo/máximo del catálogo comparable; igualdad usa 0,7, y costo invierte esa normalización. Inventario = min(1, disponible / max(2×reposición, 4)). No se elimina un factor faltante ni se sustituyen costos por constantes.</p></div></div>}
 {ran&&<p role="status" className="form-hint">{!contextReady?"Selecciona sondeo, taladro, diámetro, dureza y fracturación para evaluar.":ranking.blocked??(ranking.results.length?"Ranking calculado con todos sus criterios.":"No hay corona compatible con disponibilidad confirmada.")}</p>}
 {ordered.slice(0,showAll?undefined:3).map((p,i)=>{const result=resultMap.get(p.id);const missing=ranking.gaps.find(g=>g.product.id===p.id)?.missing??[];return <article key={p.id} className={`recommend-card ${result?`rank-${i+1}`:""} ${selected===p.id?"selected":""}`}><div className="rank"><small>{result?(i===0?"RECOMENDADA":`ALTERNATIVA ${i}`):"POR COMPLETAR"}</small><b>{result?`#${i+1}`:"—"}</b><span>{result?.score??"—"}<small>/100</small></span></div><div className="rec-main"><div className="crown-title"><div className="crown-icon">◈</div><div><small>{p.manufacturer}</small><h3>{p.product}</h3><span>{p.matrix??"Matriz por declarar"} · {p.diameter??"Diámetro por declarar"}</span></div><div className="confidence low">{result?`Confianza ${result.confidence}`:"Evidencia incompleta"}</div></div><div className="rec-metrics"><div><small>ROP histórico</small><b>{crownFmt(p.historicalRop)} <i>m/h</i></b></div>{showCosts&&<div><small>Costo estimado</small><b>{crownFmt(p.historicalCost)} <i>USD/m</i></b></div>}<div><small>Vida histórica</small><b>{crownFmt(p.historicalLife)} <i>m</i></b></div><div><small>Stock</small><b>{p.stock===null||p.reserved===null?"—":p.stock-p.reserved} <i>disp.</i></b></div></div><div className="rec-reasons"><b>{result?"Por qué aparece aquí":"Qué falta para puntuar"}</b>{(result?result.reasons:missing.filter(m=>showCosts||!m.includes("costo")&&!m.includes("precio"))).map(reason=><span key={reason}>{result?<CheckCircle2/>:<AlertTriangle/>}{reason}</span>)}</div><div className="score-bar">{result&&<span style={{width:`${result.score}%`}}/>}<small>{p.observations??"—"} turnos atribuibles · régimen no confirmado</small></div></div><button className="select-rec" onClick={()=>setSelected(p.id)}>{selected===p.id?<><CheckCircle2/>Seleccionada para revisar</>:"Seleccionar para revisar"}</button></article>})}
 {ordered.length>3&&<button className="button-link" onClick={()=>setShowAll(!showAll)}>{showAll?"Ver tres tarjetas":`Ver ${ordered.length} tarjetas`}</button>}
 {selected&&<p role="status">Selección local para comparación. No guarda ni cambia una decisión; la revisión autorizada se registra debajo con motivo y evidencia.</p>}
 {ordered.length===0&&<p>No hay coronas observadas ni fichas de catálogo en este contexto.</p>}
 </section></div>
 <section className="panel supplementary-panel"><header className="panel-head"><div><h3>Saldo bruto registrado · no disponibilidad neta</h3><p>Una apertura explícita y movimientos auditados respaldan este saldo. Las reservas siguen sin confirmar; no se asumen iguales a cero para puntuar.</p></div></header>{inventory.error&&<p role="alert">{inventory.error}</p>}<table><thead><tr><th>Código / producto</th><th>Saldo registrado</th><th>Reservas / neto</th></tr></thead><tbody>{configured.map(p=><tr key={p.id}><td>{p.id} · {p.product}</td><td>{p.stock===null?"Sin saldo confirmado":`${crownFmt(p.stock,0)} unidades`}</td><td>No confirmados</td></tr>)}</tbody></table></section>
 <section className="panel supplementary-panel"><header className="panel-head"><div><h3>{candidate?`Candidato histórico para revisión: ${candidate.serial}`:"Mantener revisión manual"}</h3><p>historical-review-v1 · regla separada del ranking multicriterio</p></div></header><FormulaInfo title="Regla del candidato histórico"><p>Único equipo y sondeo, mismo tipo entre candidatos, serie identificada y al menos dos turnos atribuibles. Dentro de ese conjunto se propone la mayor ROP pareada para revisión humana. No confirma compatibilidad, stock, vida restante ni superioridad causal.</p></FormulaInfo></section>
 <RecoveredDecisionPanel session={session} data={data} filters={data.filters} onReload={reload}/>
 <CrownHistoryEvidence data={data}/>
 <section className="panel supplementary-panel bha-readiness"><header className="panel-head"><div><h3>Próxima fase · FI, ECD y selección de BHA</h3><p>Circulación y offline siguen diferidos; no son resultados del Advisor.</p></div></header></section>
 </>;
}
