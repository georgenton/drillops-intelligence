import type {OperationalShift,OperationalReport,CrownSnapshot} from "@/packages/import/types";
import type {OperationalCatalog} from "./operational-catalog";
import type {PrivateAdvisorProduct} from "./private-advisor";
import {mseAnnularMpa} from "./rop-model";
import {buildReviewSurvey,type ReviewSurvey} from "./review-survey";
import {reviewConsumptions} from "./review-consumptions";
import {mechanicalAvailability,programmedMetres,rigEstimatePerMetre} from "./catalog-metrics";
import {reconstructCrownHistory} from "./crown-history";
import {buildReviewMse,buildReviewDepthComplements} from "./raul-mse";
import {crownReview} from "./crown-review";
import {guardiaTotals,rigConsumptionTotals,maintenanceHours,reviewPressureSeries} from "./operational-review-v2";

export type ReviewManifestEntry={id:string;kind:"EXCEL"|"DERIVADO"|"SUPUESTO"|"SINTETICO";screen:string;context:string;field:string;original:unknown;value:unknown;unit:string|null;source:unknown;formula:string|null;reason:string;affected:string[];confirm:string};
export type ReviewScenario={
 id:"REVISION_RAUL_2026_10_V1";catalog:OperationalCatalog;manifest:ReviewManifestEntry[];
 revision:"RAUL_V2_2026_10_20";
 raulMse:ReturnType<typeof buildReviewMse>;
 reviewDepthComplements:ReturnType<typeof buildReviewDepthComplements>;
 defaultContext:{from:string;to:string;rig:string;hole:string};
 candidates:PrivateAdvisorProduct[];
 dashboardCrownReferenceM:number;syntheticTariff:number;
 consumptionEntries:(Omit<ReturnType<typeof reviewConsumptions>[number],"support">&{supportRefs:string[]})[];
 analyticsRadar:{name:string;value:number[]}[];
 benchmark:{previous:{hours:number;cost:number;rop:number};current:{hours:number;cost:number;rop:number}};
 mechanicalByContext:{rig:string;hole:string;value:number;programmedHours:number;downtimeHours:number;kind:"DERIVADO"|"SINTETICO";coveredShifts:number;totalShifts:number}[];
 dashboardCrownByContext:{rig:string;hole:string;serial:string;attributedMetresM:number;ropMPerHour:number|null;referenceM:number;kind:"SUPUESTO"|"SINTETICO"}[];
 advisorContext:{diameter:"HQ";hardness:number;fracturing:"medium";abrasivity:"medium";waterReturn:"partial"};
 depthSeries:{rig:string;hole:string;track:string;unit:string;points:[number,number][]}[];
 surveys:ReviewSurvey[];
 mse:{input:{wobN:number;torqueNm:number;rpm:number;ropMetresPerHour:number;outerDiameterM:number;coreDiameterM:number;unitsConfirmed:true;geometryConfirmed:true;measurementLocation:"surface"};value:number};
};
type Data={shifts:OperationalShift[];reports:OperationalReport[];crowns:CrownSnapshot[]};
/** Pure runtime overlay: never persisted into imported reports or operational decisions. */
export function buildReviewScenario(data:Data,catalog:OperationalCatalog):ReviewScenario{
 const cloned=structuredClone(catalog),manifest:ReviewManifestEntry[]=[];
 const add=(context:string,field:string,value:unknown,kind:ReviewManifestEntry["kind"]="SINTETICO",original:unknown=null,source:unknown="Fixture de revisión V1",formula:string|null=null,unit:string|null=null,screen="Revisión")=>{
  manifest.push({id:`${context}/${field}`,kind,screen,context,field,original,value,unit,source,formula,reason:kind==="EXCEL"?"Observación conservada sin modificación.":"Complemento de revisión; no constituye medición ni calibración del cliente.",affected:[screen],confirm:`¿Confirma o sustituye ${field} para ${context}?`});return value;
 };
 const contexts=[...new Set(data.shifts.filter(s=>s.holeCode).map(s=>`${s.rigCode}\0${s.holeCode}`))].sort();
 const score=(k:string)=>{const [rig,hole]=k.split("\0");return data.reports.filter(r=>r.rigCode===rig&&r.holeCode===hole).reduce((n,r)=>n+r.survey.filter(s=>s.valid).length*100,0)+data.shifts.filter(s=>s.rigCode===rig&&s.holeCode===hole).length;};
 contexts.sort((a,b)=>score(b)-score(a)||a.localeCompare(b));
 const [rig="",hole=""]=contexts[0]?.split("\0")??[];
 const dates=data.shifts.map(s=>s.date).sort(),from=dates[0]??"",to=dates.at(-1)??"";
 const sourceKeys={advanceM:["advance","startDepth","endDepth"],drillingHours:["drillingHours"],startDepthM:["startDepth"],endDepthM:["endDepth"]};
 const shiftSource=(s:OperationalShift,keys:string[])=>({file:s.source.file,fileSha256:s.source.fileSha256,sheet:s.source.sheet,cells:Object.fromEntries(keys.filter(k=>s.source.cells[k]).map(k=>[k,s.source.cells[k]]))});
 for(const s of data.shifts)for(const field of ["advanceM","drillingHours","startDepthM","endDepthM"] as const)add(s.logicalKey,field,s[field],"EXCEL",s[field],shiftSource(s,sourceKeys[field]),field==="advanceM"?"endDepth − startDepth; se contrasta avance cacheado":null,field==="drillingHours"?"h":"m","Dashboard / Profundidad");
 for(const r of cloned.rigs){
  if(r.hourlyCostUsd==null){r.hourlyCostUsd=100;add(r.code,"hourlyCostUsd",100,"SUPUESTO",null,null,"100 USD por hora efectiva", "USD/h","Costos");}
  if(r.mechanicalDowntimeActivities===null){
   r.mechanicalDowntimeActivities=[...new Set(data.shifts.filter(s=>s.rigCode===r.code).flatMap(s=>s.activities.map(a=>a.label)).filter(l=>/mantenim|aver[ií]a|reparaci[oó]n|falla mec[aá]nica/i.test(l)))].sort();
   r.mechanicalClassificationEvidence="SUPUESTO: clasificación por etiqueta explícita de mantenimiento, avería o reparación; confirmar con supervisor.";
   add(r.code,"mechanicalDowntimeActivities",r.mechanicalDowntimeActivities,"SUPUESTO",null,"Etiquetas originales de actividad","Mantenimiento/avería/reparación explícitos; no incluye Survey, casing ni mudanza","h","Dashboard");
  }
 }
 for(const h of cloned.holes){
  const rows=data.shifts.filter(s=>s.rigCode===h.rigCode&&s.holeCode===h.code),positive=rows.filter(s=>s.advanceM!==null&&s.advanceM>0);
  const depths=rows.flatMap(s=>[s.startDepthM,s.endDepthM]).filter((n):n is number=>n!==null&&Number.isFinite(n)&&n>=0),max=depths.length?Math.max(...depths):null;
  const values={targetDepthM:max===null?500:Math.max(Math.ceil(max*1.2/50)*50,(Math.floor(max/50)+1)*50),plannedMetersPerShift:positive.length?positive.reduce((n,s)=>n+s.advanceM!,0)/positive.length*1.15:30,planStartDate:rows.map(s=>s.date).sort()[0]??from,guardsPerDay:2 as const};
  if(h.source==="observed"){add(`${h.rigCode}/${h.code}`,"source","configured","SUPUESTO","observed",null,"Configuración exclusiva del overlay, nunca persistida",null,"Dashboard / Sondeos");h.source="configured";}
  for(const field of ["targetDepthM","plannedMetersPerShift","planStartDate","guardsPerDay"] as const)if(h[field]===null){
   Object.assign(h,{[field]:values[field]});add(`${h.rigCode}/${h.code}`,field,values[field],"SUPUESTO",null,rows.map(s=>({logicalKey:s.logicalKey,...shiftSource(s,field==="targetDepthM"?["startDepth","endDepth"]:field==="plannedMetersPerShift"?["advance","startDepth","endDepth"]:["date"])})),field==="targetDepthM"?"max(ceil(maxDepth × 1.2 / 50), floor(maxDepth/50)+1) × 50; sin profundidad: 500":field==="plannedMetersPerShift"?"1.15 × media de turnos con avance positivo; sin observaciones: ejemplo 30":"Calendario de revisión, 2 guardias de 12 h","targetDepthM"===field||field==="plannedMetersPerShift"?"m":null,"Dashboard / Sondeos");
  }
 }
 const candidates:PrivateAdvisorProduct[]=[0,1,2].map(i=>({id:`REV-CORONA-${i+1}`,manufacturer:"Referencia sintética sin marca",product:`Corona de revisión ${i+1}`,matrix:`Referencia ${i+1}`,diameter:"HQ",price:900+i*150,stock:5,reserved:1,reorder:2,historicalRop:2+i*.6,historicalCost:(900+i*150)/(250+i*50),historicalLife:250+i*50,observations:3,hardnessFit:[2,3,4],fracturingFit:i===1?["low","medium"]:["medium","high"]}));
 for(const c of candidates)for(const [field,value] of Object.entries(c))add(c.id,field,value,"SINTETICO",null,"Referencia didáctica independiente; no historial del cliente",field==="historicalCost"?"precio / vida simulada":null,field==="price"?"USD":field==="historicalCost"?"USD/m":field==="historicalLife"?"m":field==="historicalRop"?"m/h":null,"Coronas / Bit Advisor");
 const advisorContext:ReviewScenario["advisorContext"]={diameter:"HQ",hardness:3,fracturing:"medium",abrasivity:"medium",waterReturn:"partial"};
 for(const [field,value] of Object.entries(advisorContext))add("Advisor",field,value,"SUPUESTO",null,null,null,null,"Bit Advisor");
 const input:ReviewScenario["mse"]["input"]={wobN:10000,torqueNm:100,rpm:600,ropMetresPerHour:2,outerDiameterM:.1,coreDiameterM:.06,unitsConfirmed:true,geometryConfirmed:true,measurementLocation:"surface"};
 const mseUnits:Record<string,string>={wobN:"N",torqueNm:"N·m",rpm:"rpm",ropMetresPerHour:"m/h",outerDiameterM:"m",coreDiameterM:"m"};
 for(const [field,value]of Object.entries(input))add("MSE sintética",field,value,"SINTETICO",null,"Fixture dimensional explícita",null,mseUnits[field]??null,"Coronas / Profundidad");
 const mse={input,value:mseAnnularMpa(input).value!};
 add("MSE sintética","value",mse.value,"DERIVADO",null,input,"[F/A + T·2πRPM/60/(A·ROP/3600)] / 10⁶; A=π(D²−d²)/4","MPa","Coronas / Profundidad");
 const depthSeries:ReviewScenario["depthSeries"]=[];
 for(const key of contexts){const [r,h]=key.split("\0"),rows=data.shifts.filter(s=>s.rigCode===r&&s.holeCode===h),depths=rows.flatMap(s=>[s.startDepthM,s.endDepthM]).filter((v):v is number=>v!==null&&Number.isFinite(v)&&v>=0),lo=depths.length?Math.min(...depths):0,hi=depths.length?Math.max(...depths):100;
  for(const [track,base,unit]of [["rop",2,"m/h"],["pressure",300,"PSI"],["torque",100,"N·m"],["rpm",600,"rpm"],["recovery",90,"%"],["mse",mse.value,"MPa"],["hardness",6,"Mohs"]] as const){
   const points:[number,number][]=[0,1,2,3,4].map(i=>[base*(1+(i%3)*.03),lo+(hi-lo)*i/4]);
   depthSeries.push({rig:r,hole:h,track,unit,points});add(`${r}/${h}`,`syntheticDepth.${track}`,points,"SINTETICO",null,{base,lo,hi},"5 puntos ilustrativos: valor base × (1+0.03×(i mod 3)); MD equiespaciada",unit,"Profundidad");
   if(track==="recovery")add(`${r}/${h}`,"syntheticRecoveryMean",points.reduce((n,p)=>n+p[0],0)/points.length,"DERIVADO",null,{manifestRef:`${r}/${h}/syntheticDepth.recovery`},"Media de puntos sintéticos de recuperación, no ensayo del cliente","%","Profundidad");
  }
  add(`${r}/${h}`,"depthAnomalyCount",null,"SUPUESTO",null,null,"No aplica: sin regla calibrada; nunca se asume cero anomalías",null,"Profundidad");
 }
 const surveys=contexts.map(k=>{const [r,h]=k.split("\0");return buildReviewSurvey(data.reports.filter(report=>report.rigCode===r&&report.holeCode===h),cloned.holes.find(v=>v.code===h&&v.rigCode===r)?.surveyConfiguration);});
 for(const s of surveys)for(const [field,value]of Object.entries(s))add(s.context,`survey.${field}`,value,s.classification==="SINTETICO"?"SINTETICO":field==="stations"?"EXCEL":field==="configuration"&&s.inputClassification==="EXCEL + SUPUESTO"?"SUPUESTO":"DERIVADO",null,{manifestRef:`${s.context}/survey.stations`},s.reason,null,"Survey");
 const defaultContext={from,to,rig,hole};add("Revisión","defaultContext",defaultContext,"DERIVADO",null,contexts,"Mayor cobertura Survey y turnos; empate por código",null,"Global");
 const dashboardCrownReferenceM=Math.max(250,Math.ceil(Math.max(0,...data.crowns.map(c=>c.observedMetres??0))*1.2/50)*50);
 add("Coronas","dashboardCrownReferenceM",dashboardCrownReferenceM,"SUPUESTO",null,data.crowns.map(c=>({key:c.key,metres:c.observedMetres,file:c.source.file,fileSha256:c.source.fileSha256,sheet:c.source.sheet,row:c.source.row,cells:Object.fromEntries(Object.entries(c.source.cells).filter(([k])=>/start|end|total|metres/i.test(k)))})),"max(250, ceil(max metros reportados × 1.2 / 50) × 50)","m","Dashboard");
 add("Revisión","syntheticTariff",100,"SINTETICO",null,null,"100 USD por hora efectiva","USD/h","Costos");
 const rawConsumptionEntries=reviewConsumptions(data.reports);
 const consumptionEntryIds=new Map(data.reports.flatMap(r=>r.consumptions.map(m=>[`${r.source.file}\0${r.source.sheet}\0${m.key}`,`consumption:${r.key}:${m.key}`] as const)));
 const consumptionEntries=rawConsumptionEntries.map(({support,...e})=>({...e,supportRefs:support.map(s=>consumptionEntryIds.get(`${s.file}\0${s.sheet}\0${s.key}`)??`${s.file}/${s.sheet}/${s.key}`)}));
 manifest.push(...consumptionEntries.map(e=>({...e,kind:e.kind as ReviewManifestEntry["kind"],context:JSON.stringify(e.context),affected:[e.affected]})));
 const normalize=(value:number,values:number[])=>Math.max(...values)===Math.min(...values)?.7:(value-Math.min(...values))/(Math.max(...values)-Math.min(...values));
 const analyticsRadar=candidates.map(c=>({name:c.product,value:[
  normalize(c.historicalRop!,candidates.map(p=>p.historicalRop!))*5,
  (1-normalize(c.historicalCost!,candidates.map(p=>p.historicalCost!)))*5,
  normalize(c.historicalLife!,candidates.map(p=>p.historicalLife!))*5,
  Math.min(1,(c.stock!-c.reserved!)/Math.max(c.reorder!*2,4))*5,
  Math.min(1,c.observations!/18)*5,
 ]}));
 add("Analítica","analyticsRadar",analyticsRadar,"DERIVADO",null,candidates,"ROP/vida min-max ×5; costo (1−min-max)×5; inventario min(1,neto/max(2×reposición,4))×5; evidencia min(1,n/18)×5; igualdad min-max=0.7", "0–5","Analítica");
 const benchmark={previous:{hours:100,cost:10000,rop:2},current:{hours:80,cost:8000,rop:2.5}};
 for(const [period,metrics]of Object.entries(benchmark))for(const [field,value]of Object.entries(metrics))add(`Pozo sintético ${period}`,field,value,"SINTETICO",null,"Dos referencias independientes del cliente",field==="cost"?"horas × 100 USD/h":null,field==="cost"?"USD":field==="hours"?"h":"m/h","Analítica");
 const mechanicalByContext:ReviewScenario["mechanicalByContext"]=[],dashboardCrownByContext:ReviewScenario["dashboardCrownByContext"]=[];
 for(const key of contexts){
  const [r,h]=key.split("\0"),rows=data.shifts.filter(s=>s.rigCode===r&&s.holeCode===h),dates:string[]=[];
  if(from&&to)for(let at=Date.parse(`${from}T00:00:00Z`);at<=Date.parse(`${to}T00:00:00Z`);at+=86400000)dates.push(new Date(at).toISOString().slice(0,10));
  const localCatalog={...cloned,holes:cloned.holes.filter(v=>v.rigCode===r&&v.code===h)};
  const source=rows.map(s=>({key:s.logicalKey,file:s.source.file,sheet:s.source.sheet,advanceM:s.advanceM,drillingHours:s.drillingHours}));
  const tariff=cloned.rigs.find(v=>v.code===r)?.hourlyCostUsd??null;
  const knownHours=rows.reduce((n,s)=>n+(s.drillingHours??0),0),knownMetres=rows.reduce((n,s)=>n+(s.advanceM??0),0),cost=knownHours*100;
  add(`${r}/${h}`,"reviewCostSummaryDerived",{knownHours,knownMetres,cost,unitCost:knownMetres>0?cost/knownMetres:null,tariff100:100,missingHours:rows.filter(s=>s.drillingHours===null).length,missingMetres:rows.filter(s=>s.advanceM===null).length},"DERIVADO",null,source,"Σhoras conocidas × 100; USD/m = costo / Σmetros conocidos (no necesariamente pareados). Ausencias contadas explícitamente, cobertura parcial; no costo operacional completo.","USD; USD/m","Costos / Reportes");
  add(`${r}/${h}`,"rigShiftCosts",rows.map(s=>({key:s.logicalKey,date:s.date,shift:s.shiftType,hours:s.drillingHours,tariff,cost:s.drillingHours===null||tariff===null?null:s.drillingHours*tariff})),"DERIVADO",null,source,"Horas efectivas observadas × tarifa del escenario; sin alquiler de 24 h","USD","Costos");
  add(`${r}/${h}`,"rigEstimatePerMetre",rigEstimatePerMetre(rows,localCatalog),"DERIVADO",null,source,"Σ(horas efectivas × tarifa del escenario) / Σmetros; null si falta componente","USD/m","Costos");
  add(`${r}/${h}`,"programmedMetres",dates.map((date,i)=>({date,value:programmedMetres(localCatalog,[h],dates)[i]})),"DERIVADO",null,localCatalog.holes,"Días de calendario desde inicio × guardias/día × meta/guardia","m","Dashboard");
  add(`${r}/${h}`,"mechanicalAvailability",mechanicalAvailability(rows,localCatalog),"DERIVADO",null,{shifts:rows.map(s=>({key:s.logicalKey,totalHours:s.totalHours,activities:s.activities})),classification:cloned.rigs.find(v=>v.code===r)?.mechanicalDowntimeActivities},"100 × (1−horas mecánicas / (12 × turnos cubiertos)); cobertura exige suma 12 h","%","Dashboard");
  const measured=mechanicalAvailability(rows,localCatalog);
  const mechanical:ReviewScenario["mechanicalByContext"][number]=measured.value===null
   ?{rig:r,hole:h,value:87.5,programmedHours:48,downtimeHours:6,kind:"SINTETICO",coveredShifts:0,totalShifts:rows.length}
   :{rig:r,hole:h,value:measured.value,programmedHours:measured.coveredShifts*12,downtimeHours:measured.downtimeHours!,kind:"DERIVADO",coveredShifts:measured.coveredShifts,totalShifts:measured.totalShifts};
  mechanicalByContext.push(mechanical);
  for(const [field,value]of Object.entries(mechanical))add(`${r}/${h}`,`mechanicalExample.${field}`,value,mechanical.kind,null,measured,measured.value===null?"Ejemplo separado: 48 h programadas, 6 h mecánicas; 100×(1−6/48)=87.5%. Cobertura real cero.":"100×(1−horas mecánicas/horas cubiertas); cobertura parcial explícita",field==="value"?"%":field.endsWith("Hours")?"h":null,"Dashboard");
  const history=reconstructCrownHistory(data.crowns.filter(c=>c.rigCode===r&&c.holeCode===h),rows);
  const representative=history.runs.filter(run=>run.serial&&run.attributedMetresM>0).sort((a,b)=>b.lastObservedDate.localeCompare(a.lastObservedDate)||a.id.localeCompare(b.id))[0];
  const crown:ReviewScenario["dashboardCrownByContext"][number]=representative
   ?{rig:r,hole:h,serial:representative.serial!,attributedMetresM:representative.attributedMetresM,ropMPerHour:representative.ropMPerHour,referenceM:Math.max(250,Math.ceil(representative.attributedMetresM*1.2/50)*50),kind:"SUPUESTO"}
   :{rig:r,hole:h,serial:"REV-CORONA-REFERENCIA",attributedMetresM:120,ropMPerHour:2.4,referenceM:250,kind:"SINTETICO"};
  dashboardCrownByContext.push(crown);
  for(const [field,value]of Object.entries(crown))add(`${r}/${h}`,`dashboardCrown.${field}`,value,crown.kind,null,representative??null,representative?"Corrida identificada más reciente con metros atribuibles >0 (empate por id). Selección representativa, NO corona activa. Referencia=max(250,ceil(metros×1.2/50)×50).":"Referencia sintética independiente; no serie real ni corona activa.",field==="attributedMetresM"||field==="referenceM"?"m":field==="ropMPerHour"?"m/h":null,"Dashboard");
 }
 const raulMse=buildReviewMse(data.shifts),reviewDepthComplements=buildReviewDepthComplements(data.shifts,data.reports);
 for(const sample of reviewPressureSeries(data.reports))add(`${sample.rig}/${sample.hole}`,`pressure:${sample.reportKey}`,sample,"SINTETICO",null,sample.source,sample.reason,"PSI","Dashboard");
 for(const sample of raulMse)add(`${sample.rigCode}/${sample.holeCode}`,sample.id,sample,sample.classification==="SINTETICO"?"SINTETICO":"SUPUESTO",sample.classification==="SINTETICO"?null:sample.input,sample.source,sample.formula,"psi experimental","Intervalos / Depth Intelligence");
 for(const sample of reviewDepthComplements){
  add(`${sample.rigCode}/${sample.holeCode}`,`inclination:${sample.shiftKey}`,sample.inclination,sample.inclination.value===null?"SINTETICO":"SUPUESTO",sample.inclination.originalDip,sample.inclination.source,sample.inclination.method,"° desde vertical","Intervalos / Depth Intelligence");
  add(`${sample.rigCode}/${sample.holeCode}`,`flow:${sample.shiftKey}`,sample.flow,sample.flow.classification==="SINTETICO"?"SINTETICO":"SUPUESTO",sample.flow.classification==="SINTETICO"?null:sample.flow.value,{observation:sample.flow.source,shiftKey:sample.shiftKey,startDepthM:sample.startDepthM,endDepthM:sample.endDepthM},sample.flow.method,sample.flow.unit,"Dashboard / Depth Intelligence");
 }
 for(const key of contexts){const [r,h]=key.split("\0"),rows=data.shifts.filter(s=>s.rigCode===r&&s.holeCode===h);
  add(`${r}/${h}`,"guardiaTotals",guardiaTotals(rows),"DERIVADO",null,rows.map(s=>s.logicalKey),"Metros y horas conocidos sumados; ROP = Σmetros pareados / Σhoras pareadas. Exclusiones explícitas.","m; h; m/h","Operación");
  const cr=crownReview(reconstructCrownHistory(data.crowns.filter(c=>c.rigCode===r&&c.holeCode===h),rows));
  add(`${r}/${h}`,"crownComparison",cr.comparison,"DERIVADO",null,rows.map(s=>s.logicalKey),"Mismo compareCrownHistory para gráfica, tabla, tooltip y exportación; separado de referencias sintéticas.","m/h","Coronas");
  add(`${r}/${h}`,"crownDepth",cr.depth,"DERIVADO",null,cr.rows.map(s=>({id:s.id,serial:s.serial,startDepthM:s.startDepthM,endDepthM:s.endDepthM,intervalM:s.intervalM,pairedMetres:s.pairedMetres,attributedHours:s.attributedHours,ropMPerHour:s.ropMPerHour})),"Límites de profundidad reportada; vacíos y solapes explícitos. No equivale al acumulado de longitudes de Performance.","m","Coronas");
 }
 for(const r of cloned.rigs){add(r.code,"rigConsumptions",rigConsumptionTotals(data.reports,r.code),"DERIVADO",null,"Reportes originales y sus unidades","No duplicar total de reporte con filas de guardia; sin convertir gls.",null,"Taladros");add(r.code,"maintenanceHours",maintenanceHours(data.shifts.filter(s=>s.rigCode===r.code)),"DERIVADO",null,"Etiquetas originales de actividad","Sólo mantenimiento/reparación; no todas las horas sin perforación.","h","Taladros");}
 add("Coronas","performanceMapping",{x:"H = G − F, longitud de corrida",y:"J = H / I, m/h",bubble:"N, costo ambiguo; se usan marcadores uniformes",bars:"Performance acumula longitudes; vista actual declara MD reportada",cost:"No adoptar COSTO X PIE: fórmula divide por metros y tarifa Q2 tiene etiqueta ambigua"},"SUPUESTO",null,"GoldTech Performance 2022.xlsx / coronas A1:N1; H3, J3, N3; gráficos 9 y 11","Se reutiliza estructura, no los registros históricos ni sus tarifas",null,"Coronas");
 return {id:"REVISION_RAUL_2026_10_V1",revision:"RAUL_V2_2026_10_20",raulMse,reviewDepthComplements,catalog:cloned,manifest,defaultContext,candidates,advisorContext,depthSeries,surveys,mse,dashboardCrownReferenceM,syntheticTariff:100,consumptionEntries,analyticsRadar,benchmark,mechanicalByContext,dashboardCrownByContext};
}
