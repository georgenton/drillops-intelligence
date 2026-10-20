import type { OperationalReport } from "@/packages/import/types";
import { calculateSurveyTrajectory,type SurveyConfiguration,type CalculatedStation } from "./survey-trajectory";
export type ReviewSurveyStation={depthM:number;dip:number;azimuth:number;valid:true;source:{file:string;sheet:string;key:string;cells:Record<string,unknown>}|null};
export type ReviewSurvey={
  context:string;rigCode:string;holeCode:string|null;classification:"DERIVADO"|"SINTETICO";inputClassification:"EXCEL + SUPUESTO"|"EXCEL + CONFIGURACION"|"SINTETICO";
  stations:ReviewSurveyStation[];points:CalculatedStation[];
  configuration:Omit<SurveyConfiguration,"azimuthReference">&{azimuthReference:SurveyConfiguration["azimuthReference"]|"nominal_unverified"};
  sourceCount:number;acceptedCount:number;discardedCount:number;coveragePercent:number;
  selection:{key:string;action:"selected"|"duplicate"|"conflict"|"invalid";reason:string}[];
  reason:string;confirm:string;
};
/** Pure scenario reconstruction. Does not mutate reports or persist a catalog setting.
 * Ties are resolved by file/sheet/station key, not input delivery order.
 */
export function buildReviewSurvey(reports:OperationalReport[],confirmed?:SurveyConfiguration|null):ReviewSurvey {
  const context=reports[0]?`${reports[0].rigCode.trim().toUpperCase()} · ${reports[0].holeCode?.trim().toUpperCase()??"Sin sondeo"}`:"Referencia sintética";
  const rows=reports.flatMap(report=>report.survey.map(station=>({station,report,order:`${report.source.file}\0${report.source.sheet}\0${station.key}\0${report.key}\0${station.dip}\0${station.azimuth}`}))).sort((a,b)=>a.order<b.order?-1:a.order>b.order?1:0);
  const selection:ReviewSurvey["selection"]=[],byDepth=new Map<number,ReviewSurveyStation>();
  for(const {station:s,report} of rows){
    const key=`${report.source.file} / ${report.source.sheet} / ${s.key}`;
    const valid=s.valid&&s.depthM!==null&&s.dip!==null&&s.azimuth!==null&&[s.depthM,s.dip,s.azimuth].every(Number.isFinite)&&s.depthM>=0&&s.azimuth>=0&&s.azimuth<=360&&
      (confirmed?.angleConvention==="inclination_from_vertical"?s.dip>=0&&s.dip<=180:Math.abs(s.dip)<=90);
    if(!valid){selection.push({key,action:"invalid",reason:"Lectura incompleta, inválida o fuera del rango de la convención activa."});continue;}
    const prior=byDepth.get(s.depthM!);
    if(prior){selection.push({key,action:prior.dip===s.dip&&prior.azimuth===s.azimuth!%360?"duplicate":"conflict",reason:`A ${s.depthM} m se conserva la primera lectura válida por orden archivo/hoja/clave; originales intactos.`});continue;}
    byDepth.set(s.depthM!,{depthM:s.depthM!,dip:s.dip!,azimuth:s.azimuth!%360,valid:true,source:{file:report.source.file,sheet:report.source.sheet,key:s.key,cells:s.cells}});
    selection.push({key,action:"selected",reason:"Primera lectura válida de esta profundidad según orden determinístico."});
  }
  let stations=[...byDepth.values()].sort((a,b)=>a.depthM-b.depthM);
  const configuration:ReviewSurvey["configuration"]=confirmed?{...confirmed,anchor:{...confirmed.anchor}}:{
    angleConvention:"dip_negative_down",azimuthReference:"nominal_unverified",method:"minimum_curvature",
    anchor:{depthM:stations[0]?.depthM??0,eastM:0,northM:0,tvdM:0},
    evidence:"SUPUESTO DE REVISIÓN: DIP negativo descendente, origen local en primera estación medida; azimut nominal no verificado.",
  };
  // The numeric integrator only needs azimuth degrees; its north enum applies no
  // correction. The public scenario retains nominal_unverified, never grid/true north.
  let result=calculateSurveyTrajectory(stations,{...configuration,azimuthReference:configuration.azimuthReference==="nominal_unverified"?"grid_north":configuration.azimuthReference});
  let reason=confirmed?"Reconstrucción por curvatura mínima con configuración declarada; no valida el levantamiento.":"Reconstrucción relativa de revisión: inclinación = 90° + DIP y ancla local cero a la primera MD. No se extrapola hasta superficie.";
  let synthetic=false;
  if(result.status!=="ready"){
    synthetic=true;reason=`Referencia sintética separada: ${result.reasons.join(" ")}`;
    stations=[0,30,60,90,120].map((depthM,i)=>({depthM,dip:-80+i*5,azimuth:40+i*3,valid:true as const,source:null}));
    Object.assign(configuration,{angleConvention:"dip_negative_down",azimuthReference:"nominal_unverified",anchor:{depthM:0,eastM:0,northM:0,tvdM:0},evidence:"SINTETICO: estaciones de ejemplo 0–120 m MD, DIP −80° a −60°, azimut nominal 40° a 52°."});
    result=calculateSurveyTrajectory(stations,{...configuration,azimuthReference:"grid_north"});
  }
  const acceptedCount=selection.filter(s=>s.action==="selected").length;
  return {context:synthetic?`Referencia sintética separada · ${context}`:context,rigCode:reports[0]?.rigCode.trim().toUpperCase()??"SYNTHETIC-SURVEY",holeCode:reports[0]?.holeCode?.trim().toUpperCase()??null,classification:synthetic?"SINTETICO":"DERIVADO",inputClassification:synthetic?"SINTETICO":confirmed?"EXCEL + CONFIGURACION":"EXCEL + SUPUESTO",stations,points:result.points,configuration,sourceCount:rows.length,acceptedCount,discardedCount:rows.length-acceptedCount,coveragePercent:synthetic?0:100,selection,reason,confirm:"Confirme convención DIP, referencia de azimut, origen y cuál lectura conservar en profundidades contradictorias."};
}
