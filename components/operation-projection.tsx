import type { OperationalShift } from "@/packages/import/types";
import { forecastAdvance24h } from "@/packages/domain/calculations";
import { FormulaInfo } from "./formula-info";

export function OperationProjection({shifts}:{shifts:OperationalShift[]}) {
  const rigs=[...new Set(shifts.map(s=>s.rigCode))];
  const holes=[...new Set(shifts.map(s=>s.holeCode).filter(Boolean))];
  const last=[...shifts].sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
  const days:{metres:number;hours:number}[]=[];
  if(rigs.length===1&&holes.length===1&&last){
    for(let i=0;i<7;i++){
      const date=new Date(Date.parse(`${last.date}T00:00:00Z`)-i*86400000).toISOString().slice(0,10);
      const rows=shifts.filter(s=>s.date===date);
      if(rows.length!==2||new Set(rows.map(s=>s.shiftType)).size!==2||rows.some(s=>s.advanceM===null||s.drillingHours===null||s.totalHours!==12))break;
      days.unshift({metres:rows.reduce((sum,s)=>sum+s.advanceM!,0),hours:rows.reduce((sum,s)=>sum+s.drillingHours!,0)});
    }
  }
  const projection=days.length?forecastAdvance24h(days):null;
  const fmt=(n:number)=>new Intl.NumberFormat("es-EC",{maximumFractionDigits:1}).format(n);
  return <section className="panel supplementary-panel">
    <header className="panel-head"><div><h3>Proyección predictiva · próximas 24 horas</h3><p>Desde el corte observado {last?.date??"no disponible"}, no desde una fecha demo.</p></div></header>
    {projection?<><div className="kpi-grid four">
      <div className="kpi-card"><div className="kpi-label">Avance central</div><div className="kpi-value">{fmt(projection.central)}<small>m / 24 h</small></div></div>
      <div className="kpi-card"><div className="kpi-label">Banda heurística</div><div className="kpi-value">{fmt(projection.low)}–{fmt(projection.high)}<small>m</small></div></div>
      <div className="kpi-card"><div className="kpi-label">Horas efectivas históricas</div><div className="kpi-value">{fmt(days.reduce((sum,d)=>sum+d.hours,0)/days.length)}<small>h / día</small></div></div>
      <div className="kpi-card"><div className="kpi-label">Días completos consecutivos</div><div className="kpi-value">{days.length}</div></div>
    </div><p>Extrapolación descriptiva, no predicción calibrada ni compromiso de producción. La banda no es un intervalo estadístico de confianza. 24 horas calendario no equivalen a 24 horas de perforación.</p></>:<p>Selecciona un solo equipo y sondeo con al menos un día completo (dos guardias de 12 h con avance y horas conocidos) al final del corte. No se rellenan días ausentes con cero.</p>}
    <FormulaInfo title="Regla de proyección de 24 horas"><p>Se conserva forecastAdvance24h: media ponderada de hasta siete días consecutivos completos, con pesos 1…n y ajuste de tendencia limitado al 20% de la media. La banda usa el máximo entre 10% del avance central y 1,65 veces el error absoluto medio. No utiliza la ecuación exponencial del simulador ni deduce desgaste.</p></FormulaInfo>
  </section>;
}
