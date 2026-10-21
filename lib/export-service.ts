import writeXlsxFile, { type SheetData } from "write-excel-file/node";
import type { OperationalShift, OperationalReport, CrownSnapshot } from "@/packages/import/types";
import type {ReviewScenario} from "@/packages/domain/review-scenario";
// Always typed strings, never formula cells. Prefix dangerous spreadsheet text for downstream copies too.
export function safeExcelText(value:string) { return /^[\s]*[=+@\-]/.test(value)?`'${value}`:value; }
type Value=string|number|null;
function table(headers:string[],rows:Value[][]):SheetData {
  return [headers.map(value=>({value,type:String,fontWeight:"bold" as const})),...rows.map(row=>row.map(value=>value===null?null:typeof value==="number"?{value,type:Number}:{value:safeExcelText(value),type:String}))];
}
export async function exportOperationalXlsx(data:{shifts:OperationalShift[];reports?:OperationalReport[];crowns:CrownSnapshot[];reviewScenario?:ReviewScenario|null}) {
  const context=(s:OperationalShift)=>[s.date,s.rigCode,s.holeCode,s.shiftType] as Value[];
  const reports=data.reports??[];
  return writeXlsxFile([
    ...(data.reviewScenario?[{sheet:"Escenario de revisión",data:table(["Escenario","Clase","Pantalla","Contexto","Campo","Dato original","Valor utilizado","Unidad","Fuente","Fórmula","Motivo","Confirmar"],data.reviewScenario.manifest.map(m=>[data.reviewScenario!.id,m.kind,m.screen,JSON.stringify(m.context),m.field,JSON.stringify(m.original)??null,JSON.stringify(m.value)??null,m.unit,JSON.stringify(m.source),m.formula??null,m.reason,m.confirm]))}]:[]),
    {sheet:"Turnos",data:table(["Fecha","Taladro","Sondeo","Guardia","Desde (m)","Hasta (m)","Avance (m)","Perforación (h)","Actividades (h)","Diámetro declarado","RPM","Torque (unidad no confirmada)","Pulldown (PSI)","Holdback (PSI)","Archivo","Hoja"],data.shifts.map(s=>[...context(s),s.startDepthM,s.endDepthM,s.advanceM,s.drillingHours,s.totalHours,s.diameter??null,s.parameters.rpm,s.parameters.torque,s.parameters.pulldownPsi,s.parameters.holdbackPsi,s.source.file,s.source.sheet]))},
    {sheet:"Actividades",data:table(["Fecha","Taladro","Sondeo","Guardia","Actividad","Horas","Celda"],data.shifts.flatMap(s=>s.activities.map(a=>[...context(s),a.label,a.hours,a.cell])))},
    {sheet:"Survey",data:table(["Fecha","Taladro","Sondeo","Profundidad (m)","DIP (°)","Azimut (°)","Referencia declarada","Equipo","Válido","Archivo","Hoja"],reports.flatMap(r=>r.survey.map(s=>[r.date,r.rigCode,r.holeCode,s.depthM,s.dip,s.azimuth,s.reference,s.equipment,s.valid?"Sí":"No",r.source.file,r.source.sheet])))},
    {sheet:"Consumos",data:table(["Fecha","Taladro","Sondeo","Guardia o reporte","Bloque","Concepto","Valor observado","Unidad de origen","Validez","Archivo","Hoja","Lectura inicial","Lectura final","Advertencias","Clave de evidencia"],reports.flatMap(r=>[...r.consumptions.map(c=>({...c,block:"Consumos"})),...r.materials.map(c=>({...c,block:"Materiales"})),...r.equipmentHours.map(c=>({...c,block:"Horas equipo"})),...r.fluidParameters.map(c=>({...c,block:"Fluidos"}))].map(c=>[r.date,r.rigCode,r.holeCode,c.shiftType??"Reporte",c.block,c.label,c.value,c.unit,c.validity,c.key.startsWith("quick:")?"Registro complementario manual":r.source.file,c.key.startsWith("quick:")?null:r.source.sheet,c.cells.start?.raw??null,c.cells.end?.raw??null,c.warnings.join("; ")||null,c.key])))},
    {sheet:"Coronas",data:table(["Fecha","Taladro","Sondeo","Serie","Tipo","Marca","Desde (m)","Hasta (m)","Metros observados (snapshot, no sumar)","Archivo","Hoja"],data.crowns.map(c=>[c.date,c.rigCode,c.holeCode,c.serial,c.type,c.brand,c.startDepthM,c.endDepthM,c.observedMetres,c.source.file,c.source.sheet]))},
    {sheet:"Contexto operacional",data:table(["Fecha","Taladro","Sondeo","Guardia","Proyecto","Tipo de perforación","Barril declarado","DIP guardia (°)","Azimut guardia (°)"],data.shifts.map(s=>[...context(s),s.projectCode,s.drillingType??null,s.barrel??null,s.observedDip??null,s.observedAzimuth??null]))},
    {sheet:"Observaciones",data:table(["Fecha","Taladro","Sondeo","Observación operacional","Archivo","Hoja"],reports.filter(r=>r.observations).map(r=>[r.date,r.rigCode,r.holeCode,r.observations??null,r.source.file,r.source.sheet]))},
  ].map(sheet=>({...sheet,stickyRowsCount:1,columns:sheet.data[0].map(()=>({width:24}))}))).toBuffer();
}
