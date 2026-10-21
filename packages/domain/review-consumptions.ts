import type {OperationalReport} from "@/packages/import/types";
export function reviewConsumptions(reports:OperationalReport[]){
 const rows=reports.flatMap(r=>r.consumptions.map(m=>({report:r,measurement:m})));
 return rows.map(({report:r,measurement:m})=>{
  const observed=m.validity==="observed"&&m.value!==null&&Number.isFinite(m.value)&&m.value>=0;
  const comparable=rows.filter(x=>x.report.rigCode===r.rigCode&&x.measurement.label===m.label&&x.measurement.unit===m.unit&&x.measurement.validity==="observed"&&x.measurement.value!==null&&Number.isFinite(x.measurement.value)&&x.measurement.value>=0);
  const sorted=comparable.map(x=>x.measurement.value!).sort((a,b)=>a-b);
  const median=sorted.length?(sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.floor(sorted.length/2)])/2:null;
  // No unit assumption: only create a synthetic value for an explicit original unit.
  const value=observed?m.value:median??(m.unit?(/agua/i.test(m.label)?2:20):null);
  const kind=observed?"EXCEL":median!==null?"SUPUESTO":"SINTETICO";
  return {id:`consumption:${r.key}:${m.key}`,kind,screen:"Dashboard / Consumibles / Reportes",context:{rig:r.rigCode,hole:r.holeCode,date:r.date,shift:m.shiftType},
   field:m.label,original:m.value,value,unit:m.unit,source:{file:r.source.file,sheet:r.source.sheet,cells:m.cells},
   formula:observed?"Valor observado, sin transformación":median!==null?"Mediana de valores válidos del mismo equipo, concepto y unidad":"Referencia de demostración separada",
   reason:observed?"Lectura válida conservada":median!==null?"Lectura ausente/inválida; estimación comparable, sin corregir Excel":"Sin comparables suficientes; ejemplo no medido",
   affected:"Consumo del escenario; no modifica metros, horas ni existencias",
   confirm:observed?"¿La lectura y su unidad corresponden al consumo del turno?":"¿Qué consumo real debe sustituir esta referencia?",
   support:observed?[]:comparable.map(x=>({file:x.report.source.file,sheet:x.report.source.sheet,date:x.report.date,key:x.measurement.key,value:x.measurement.value,cells:x.measurement.cells})),
   range:sorted.length?[sorted[0],sorted.at(-1)]:null,
  };
 });
}
