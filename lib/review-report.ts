/** Same manifest as the UI; escapes source values and never emits executable spreadsheet cells. */
import {reviewV2Html} from "./review-v2-report";
import type {ReviewScenario} from "@/packages/domain/review-scenario";
const escape=(value:unknown)=>String(typeof value==="object"?JSON.stringify(value):value??"No registrado").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const fieldLabel=(value:unknown)=>{
 const key=String(value??""),names:Record<string,string>={targetDepthM:"Profundidad objetivo provisional",plannedMetersPerShift:"Meta por guardia",guardsPerDay:"Guardias programadas por día",planStartDate:"Inicio del calendario supuesto",hourlyCostUsd:"Tarifa por hora efectiva",mechanicalDowntimeActivities:"Actividades clasificadas provisionalmente como mecánicas",price:"Precio de referencia",stock:"Existencia inicial de ejemplo",reserved:"Unidades reservadas de ejemplo",reorder:"Punto de reposición",historicalRop:"ROP del ejemplo, no historial real",historicalCost:"Costo por metro del ejemplo",historicalLife:"Vida de referencia simulada",observations:"Observaciones del ejemplo, no turnos del cliente",hardnessFit:"Compatibilidad de dureza supuesta",fracturingFit:"Fracturación compatible supuesta",wobN:"Fuerza sobre corona",torqueNm:"Torque",rpm:"Velocidad de rotación",ropMetresPerHour:"Velocidad de penetración",outerDiameterM:"Diámetro exterior de la corona",coreDiameterM:"Diámetro interior",measurementLocation:"Ubicación de la medición sintética",programmedMetres:"Avance programado por fecha",rigShiftCosts:"Costo parcial por turno",rigEstimatePerMetre:"Costo parcial por metro",mechanicalAvailability:"Disponibilidad calculada y cobertura original",defaultContext:"Contexto inicial de revisión",syntheticTariff:"Tarifa de equipo del ejemplo",dashboardCrownReferenceM:"Referencia general de metros para coronas",analyticsRadar:"Factores normalizados del gráfico comparativo",referenceM:"Referencia de metros",attributedMetresM:"Metros atribuibles",ropMPerHour:"ROP atribuible",programmedHours:"Horas programadas",downtimeHours:"Horas mecánicas",coveredShifts:"Turnos con cobertura completa",totalShifts:"Turnos originales",serial:"Identificador de corona"};
 const part=key.split(".").at(-1)!;return names[key]??(key.includes(".")?`${key.startsWith("syntheticDepth.")?"Serie sintética de profundidad":key.startsWith("mechanicalExample.")?"Disponibilidad de revisión":"Corona de referencia"}: ${names[part]??part}`:key);
};
export function reviewCsv(scenario:ReviewScenario){
 const rows=scenario.manifest as unknown as Record<string,unknown>[];
 const keys=[...new Set(rows.flatMap(row=>Object.keys(row)))];
 const cell=(value:unknown)=>{
  let text=typeof value==="object"?JSON.stringify(value):String(value??"");
  if(/^[\s]*[=+@\-]/.test(text))text=`'${text}`;
  return `"${text.replace(/"/g,'""')}"`;
 };
 return "\uFEFF"+[keys.map(cell).join(","),...rows.map(row=>keys.map(key=>cell(row[key])).join(","))].join("\r\n");
}
export function reviewHtml(scenario:ReviewScenario){
 const rows=scenario.manifest as unknown as Record<string,unknown>[];
 const primary=rows.filter(r=>r.kind!=="EXCEL"&&!String(r.field).startsWith("survey.")&&!String(r.id).startsWith("consumption:")&&!/^(mse:|synthetic-mse:|inclination:|flow:|pressure:)/.test(String(r.field)));
 const surveyRows=rows.filter(r=>String(r.field).startsWith("survey."));
 const contexts=[...new Set(primary.map(r=>String(r.context)))];
 const sourceLabel=(value:unknown):string=>{
  if(Array.isArray(value)){const labels=[...new Set(value.map(sourceLabel))];return labels.length>3?`${value.length} referencias de origen. Primera: ${labels[0]}; última: ${labels.at(-1)}. Lista completa vinculada a esta entrada en JSON/CSV.`:labels.join("; ");}
  if(value&&typeof value==="object"){
   const v=value as Record<string,unknown>;
   if(v.source)return sourceLabel(v.source);
   if(v.file)return `${v.file} / ${v.sheet??""}${v.cells?" · "+Object.values(v.cells as object).map((c:{cell?:string})=>c.cell??"").join(", "):""}`;
  }
  return typeof value==="string"?value:"Entradas del registro completo JSON/CSV";
 };
 const compact=(value:unknown)=>{
  if(Array.isArray(value)&&JSON.stringify(value).length>650)return `${value.length} registros. Inicio: ${escape(JSON.stringify(value.slice(0,2)))}. Final: ${escape(JSON.stringify(value.at(-1)))}. Serie completa exacta en JSON/CSV, bajo el mismo campo.`;
  return escape(typeof value==="object"?JSON.stringify(value):value);
 };
 return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DrillOps — datos de los reportes y supuestos para revisar</title><style>
 body{font:15px/1.55 Arial,sans-serif;background:#f2f5f5;color:#18313b;margin:0}main{max-width:1050px;margin:auto;padding:36px}
 header{border-top:6px solid #b9dc32;padding:24px;background:#102129;color:white}h1{font-size:29px;line-height:1.2}h2{font-size:20px}
 .brand{letter-spacing:3px;color:#d7ff43}nav{display:flex;gap:20px;margin:20px 0}a{color:#16705f}
 article{background:white;padding:22px;margin:18px 0;border:1px solid #d8e3e3;border-radius:8px}
 table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}th,td{padding:8px;border:1px solid #d8e3e3;vertical-align:top;overflow-wrap:anywhere}th{background:#eaf0ee;text-align:left}tr{break-inside:avoid}thead{display:table-header-group}h2{break-after:avoid}
 dt{font-weight:bold;margin-top:10px}dd{margin:0;overflow-wrap:anywhere;white-space:pre-wrap}small{color:#51676d}
 .kind{background:#eaf3cc;padding:3px 8px;border-radius:5px}footer{margin-top:30px}
 @media print{body{background:white;font-size:11px}main{padding:0}nav,.no-print{display:none}article{padding:8px;border:0}table{font-size:9px}th,td{padding:5px}h1{font-size:25px}a{color:inherit}details{display:none}}
 </style></head><body><main><header><div class="brand">SYNTAVERA · DRILLOPS INTELLIGENCE</div><h1>DrillOps — datos de los reportes y supuestos para revisar</h1><p>Conservamos los datos de tus reportes. Para mostrar todos los paneles añadimos los supuestos detallados aquí. Puedes confirmar cada uno o indicarnos el valor que debemos reemplazar.</p></header>
 <nav><a href="?format=json">Registro completo JSON</a><a href="?format=csv">Registro completo CSV</a><a href="/dashboard">Volver a DrillOps</a></nav>
 <p>Escenario: <b>${escape(scenario.id)}</b>. Periodo de referencia: mayo de 2026. ${rows.length} registros de procedencia y complementos. La validación de Raúl continúa pendiente.</p>
 <p>EXCEL = observación de la fuente; DERIVADO = cálculo identificado; SUPUESTO = interpretación o referencia por confirmar; SINTETICO = ejemplo, no medición del cliente. Los costos de ejemplo no son cotizaciones. Las trayectorias relativas no son levantamientos topográficos certificados.</p>
 <h2>Cobertura y originales conservados</h2><p>${rows.filter(r=>r.kind==="EXCEL").length} registros de campos observados; ${rows.filter(r=>r.kind==="SUPUESTO").length} supuestos; ${rows.filter(r=>r.kind==="SINTETICO").length} ejemplos; ${rows.filter(r=>r.kind==="DERIVADO").length} cálculos. Son registros del manifiesto, no turnos adicionales.</p>
 <p>Consumos: ${scenario.consumptionEntries.filter(r=>r.kind==="EXCEL").length} de ${scenario.consumptionEntries.length} lecturas originales (${scenario.consumptionEntries.length?(100*scenario.consumptionEntries.filter(r=>r.kind==="EXCEL").length/scenario.consumptionEntries.length).toFixed(1):0}%); el resto es complemento del escenario, sin corregir el archivo.</p>
 ${reviewV2Html(scenario)}
 ${contexts.map(context=>`<article><h2>${escape(context)}</h2><table><thead><tr><th style="width:22%">Campo / pantalla</th><th style="width:25%">Valor exacto / unidad / clase</th><th>Origen, cálculo y confirmación</th></tr></thead><tbody>${primary.filter(r=>String(r.context)===context).map(row=>`<tr><td>${escape(fieldLabel(row.field))}<br/><small>${escape(row.screen)}</small></td><td>${compact(row.value)} ${escape(row.unit??"")}<br/><span class="kind">${escape(row.kind)}</span><br/>Original: ${compact(row.original)}</td><td>${escape(row.formula??"")}<br/>${escape(row.reason)}<br/>Fuente: ${escape(sourceLabel(row.source))}<br/>${escape(row.confirm)}</td></tr>`).join("")}</tbody></table><p>☐ Coincide &nbsp; ☐ No coincide &nbsp; ☐ No pude verificar · Observación: ____________________</p></article>`).join("")}
 <h2>Consumos complementados: valores exactos</h2><p>Se utiliza la mediana del mismo equipo, concepto y unidad. Si no existen comparables, se muestra un ejemplo sintético explícito. Las filas de apoyo y sus celdas están enlazadas por ID en el registro completo. Raúl debe confirmar cada cantidad y unidad antes de sustituir una lectura original.</p><table><thead><tr><th>Fecha / equipo / sondeo</th><th>Concepto / unidad</th><th>Original → revisión</th><th>Clase / fuente</th></tr></thead><tbody>${scenario.consumptionEntries.filter(r=>r.kind!=="EXCEL").map(r=>`<tr><td>${escape(r.context.date)} · ${escape(r.context.rig)} · ${escape(r.context.hole)} · ${escape(r.context.shift??"reporte")}</td><td>${escape(r.field)} (${escape(r.unit)})</td><td>${compact(r.original)} → ${compact(r.value)}</td><td>${escape(r.kind)}<br/>${escape(sourceLabel(r.source))}</td></tr>`).join("")}</tbody></table><p>☐ Coincide &nbsp; ☐ No coincide &nbsp; ☐ No pude verificar · Observación: ____________________</p>
 <h2>Survey: configuración y reconstrucción exacta</h2>${scenario.surveys.map(s=>`<article><h2>${escape(s.context)}</h2><p>${escape(s.reason)} ${escape(s.confirm)}</p><p>${s.acceptedCount} estaciones utilizadas de ${s.sourceCount}; cobertura ${s.coveragePercent}%. ${escape(s.classification)}.</p><p>Configuración: ${compact(s.configuration)}</p><table><thead><tr><th>MD (m)</th><th>DIP (°)</th><th>Azimut (°)</th><th>E / N / TVD relativos (m)</th></tr></thead><tbody>${s.stations.map((station,i)=>`<tr><td>${station.depthM}</td><td>${station.dip}</td><td>${station.azimuth}</td><td>${compact(s.points[i])}</td></tr>`).join("")}</tbody></table><p>☐ Coincide &nbsp; ☐ No coincide &nbsp; ☐ No pude verificar · Observación: ____________________</p></article>`).join("")}
 <details class="no-print"><summary>Consultar los campos originales y el detalle completo de selección Survey</summary>${[...rows.filter(r=>r.kind==="EXCEL"),...surveyRows].map(row=>`<article><h2>${escape(row.context)} · ${escape(fieldLabel(row.field))}</h2><p>${compact(row.value)}</p><p>${escape(sourceLabel(row.source))}</p></article>`).join("")}</details>
 <footer>Generado desde el mismo manifiesto del escenario activo. Los reportes originales permanecen separados. Ni la publicación ni las pruebas técnicas representan aceptación operacional.</footer></main></body></html>`;
}
