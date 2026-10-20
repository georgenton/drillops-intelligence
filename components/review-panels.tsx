"use client";
import {useState} from "react";
import type {RecoveredData} from "./recovered-operational-views";
import {useReviewScenario,ReviewMark} from "./review-scenario";
import {EChart} from "./echart";
const fmt=(n:number)=>new Intl.NumberFormat("es-EC",{maximumFractionDigits:2}).format(n);
export function ReviewConsumptionPanel({data}:{data:RecoveredData}){
 const {scenario,enabled}=useReviewScenario();
 const [selected,setSelected]=useState("");
 if(!enabled||!scenario)return null;
 const rows=scenario.consumptionEntries.filter(r=>(!data.filters.rig||r.context.rig===data.filters.rig)&&(!data.filters.hole||r.context.hole===data.filters.hole)&&(!data.filters.from||r.context.date>=data.filters.from)&&(!data.filters.to||r.context.date<=data.filters.to));
 const groups=[...new Set(rows.filter(r=>r.value!==null&&r.unit).map(r=>`${r.field} · ${r.unit}`))];
 const group=groups.includes(selected)?selected:groups[0];
 const active=rows.filter(r=>`${r.field} · ${r.unit}`===group);
 const dates=[...new Set(active.map(r=>r.context.date))].sort();
 const observed=dates.map(d=>active.filter(r=>r.context.date===d&&r.kind==="EXCEL").reduce((n,r)=>n+(r.value??0),0));
 const estimated=dates.map(d=>active.filter(r=>r.context.date===d&&r.kind!=="EXCEL").reduce((n,r)=>n+(r.value??0),0));
 const observedCount=rows.filter(r=>r.kind==="EXCEL").length;
 return <section className="panel supplementary-panel"><header className="panel-head"><div><h3>Consumos del escenario de revisión</h3><p>{observedCount} lecturas originales / {rows.length} · {rows.length-observedCount} complementos identificados · cantidades nunca mezcladas entre unidades</p></div><ReviewMark/></header>
 <div className="actionbar"><label>Concepto y unidad<select aria-label="Consumo de revisión" value={group??""} onChange={e=>setSelected(e.target.value)}>{groups.map(g=><option key={g}>{g}</option>)}</select></label><span>Total del escenario: {fmt(observed.reduce((a,b)=>a+b,0)+estimated.reduce((a,b)=>a+b,0))} {active[0]?.unit}</span></div>
 <EChart className="chart chart-lg" ariaLabel="Consumos originales y complementos del escenario" option={{tooltip:{trigger:"axis"},legend:{textStyle:{color:"#9facb4"}},grid:{left:55,right:24,top:40,bottom:60},xAxis:{type:"category",data:dates,axisLabel:{color:"#9facb4",hideOverlap:true}},yAxis:{type:"value",name:active[0]?.unit??"",axisLabel:{color:"#9facb4"}},series:[{name:"Excel",type:"bar",stack:"consumo",data:observed,itemStyle:{color:"#41d6a3"}},{name:"Complemento estimado/sintético",type:"bar",stack:"consumo",data:estimated,itemStyle:{color:"#f4b942"}}]}}/>
 </section>;
}
export function ReviewAnalytics(){
 const {scenario,enabled}=useReviewScenario();
 if(!enabled||!scenario)return null;
 const candidates=scenario.candidates;
 const max=(key:"historicalRop"|"historicalLife")=>Math.max(...candidates.map(c=>c[key]??0),1);
 return <section className="panel"><header className="panel-head"><div><h3>Perfil comparativo del escenario</h3><p>Referencias sintéticas independientes; no aumenta la confianza del historial real.</p></div><ReviewMark simulated/></header>
 <EChart className="chart chart-lg" ariaLabel="Perfil comparativo de referencias sintéticas" option={{legend:{textStyle:{color:"#9facb4"}},tooltip:{},radar:{indicator:[{name:"ROP",max:100},{name:"Vida referencia",max:100},{name:"Stock neto",max:100}],axisName:{color:"#9facb4"}},series:[{type:"radar",data:candidates.map(c=>({name:c.product,value:[100*(c.historicalRop??0)/max("historicalRop"),100*(c.historicalLife??0)/max("historicalLife"),100*((c.stock??0)-(c.reserved??0))/(c.stock||1)]}))}]}}/>
 </section>;
}
export function ReviewCostSummary({data}:{data:RecoveredData}){
 const {scenario,enabled}=useReviewScenario();
 if(!enabled||!scenario)return null;
 const cost=scenario.syntheticTariff*data.summary.drillingHours;
 return <section className="panel supplementary-panel"><header className="panel-head"><div><h3>Costo parcial de referencia · sólo equipo</h3><p>Tarifa sintética × horas efectivas reales. No incluye compras ni consumibles y no expone las tarifas financieras privadas.</p></div><ReviewMark/></header><div className="parameters-grid">
 <div className="metric-range"><header style={{display:"flex",flexDirection:"column",alignItems:"flex-start"}}><span>Tarifa de ejemplo</span><b>{fmt(scenario.syntheticTariff)} USD/h</b></header></div>
 <div className="metric-range"><header style={{display:"flex",flexDirection:"column",alignItems:"flex-start"}}><span>Costo estimado</span><b>{fmt(cost)} USD</b></header></div>
 <div className="metric-range"><header style={{display:"flex",flexDirection:"column",alignItems:"flex-start"}}><span>Costo parcial por metro</span><b>{data.summary.advanceM>0?fmt(cost/data.summary.advanceM):"No aplica"} USD/m</b></header></div>
 </div></section>;
}
