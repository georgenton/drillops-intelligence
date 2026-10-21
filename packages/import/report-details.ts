import { createHash } from "node:crypto";
import type { Sheet } from "./ooxml";
import type { OperationalReport, ReportMeasurement, SourceCell } from "./types";
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
const str=(s:Sheet,c:string)=>{const v=s.cells.get(c)?.value;return v==null?null:String(v).trim()||null;};
const num=(s:Sheet,c:string)=>{const v=s.cells.get(c)?.value;return typeof v==="number"&&Number.isFinite(v)?v:null;};
const src=(s:Sheet,c:string,unit:string|null=null):SourceCell=>({cell:c,raw:s.cells.get(c)?.value??null,formula:s.cells.get(c)?.formula??null,unit});
export function parseReportDetails(sheet:Sheet,base:Pick<OperationalReport,"date"|"rigCode"|"holeCode"|"source">,wide:boolean):OperationalReport {
 const key=hash(`${base.date}|${base.rigCode}|report`),out:OperationalReport={...base,key,survey:[],consumptions:[],materials:[],equipmentHours:[],fluidParameters:[]};
 const col=(compact:string,expanded:string)=>wide?expanded:compact;
 const add=(list:ReportMeasurement[],label:string,cell:string,unit:string|null,shiftType:ReportMeasurement["shiftType"],extra:Record<string,SourceCell>={},requireEndpoints=false)=>{
  const raw=num(sheet,cell),warnings:string[]=[];
  if(raw!==null&&raw<0)warnings.push("NEGATIVE_MEASUREMENT");
  if(requireEndpoints && Object.values(extra).some(s=>typeof s.raw!=="number"))warnings.push("ENDPOINTS_MISSING_CACHE_NOT_OBSERVATION");
  if(requireEndpoints && typeof extra.start?.raw==="number" && typeof extra.end?.raw==="number" && raw!==null && Math.abs(extra.end.raw-extra.start.raw-raw)>0.01)warnings.push("ENDPOINT_TOTAL_MISMATCH");
  const validity=warnings.length?"invalid":raw===null?"missing":"observed";
  list.push({key:hash(`${key}|${cell}|${label}`),label,value:validity==="observed"?raw:null,unit,shiftType,validity,cells:{value:src(sheet,cell,unit),...extra},warnings});
 };
 for(const [shiftType,r] of [["day",11],["night",12]] as const){
  const waterUnit=src(sheet,`${col("T","U")}${r}`),waterUnitText=typeof waterUnit.raw==="string"?waterUnit.raw:null;
  add(out.consumptions,"Agua",`${col("S","T")}${r}`,waterUnitText,shiftType,{start:src(sheet,`F${r}`),end:src(sheet,`${col("O","P")}${r}`)},true);
  const water=out.consumptions.at(-1)!;water.cells.unit=waterUnit;
  if(!waterUnitText){water.warnings.push("UNIT_MISSING_OR_DISPLACED");water.validity="invalid";water.value=null;}
  const fuelCell=`${col("AK","AL")}${r}`,formula=sheet.cells.get(fuelCell)?.formula,refs=formula?.match(/^\+?([A-Z]+\d+)-([A-Z]+\d+)$/);
  add(out.consumptions,"Combustible",fuelCell,str(sheet,`${col("AL","AM")}${r}`),shiftType,refs?{start:src(sheet,refs[2]),end:src(sheet,refs[1])}:{},!!refs);
  const start=src(sheet,`${col("T","U")}${r-3}`,"h"),end=src(sheet,`${col("X","Y")}${r-3}`,"h");
  const delta=typeof start.raw==="number"&&typeof end.raw==="number"?end.raw-start.raw:null;
  out.equipmentHours.push({key:hash(`${key}|meter|${r}`),label:"Horas según horómetro",value:delta!==null&&delta>=0?delta:null,unit:"h",shiftType,validity:delta===null?"missing":delta<0?"invalid":"observed",cells:{start,end},warnings:delta!==null&&delta<0?["METER_DECREASE"]:[]});
 }
 // Fluid readings apply to the daily report, not two independent shifts.
 for(const [label,r] of [["Viscosidad",6],["Presión",7],["Caudal",8]] as const){
  const c=`${col("AF","AG")}${r}`,raw=str(sheet,c),match=raw?.match(/^([+-]?\d+(?:[.,]\d+)?)\s*(.*)$/);
  const value=match?Number(match[1].replace(",",".")):num(sheet,c);
  out.fluidParameters.push({key:hash(`${key}|${c}`),label,value:value!==null&&value<0?null:value,unit:match?.[2]||null,shiftType:null,validity:value===null?"missing":value<0?"invalid":"observed",cells:{value:src(sheet,c,match?.[2]||null)},warnings:value!==null&&!match?.[2]?["UNIT_UNDECLARED"]:[]});
 }
 for(const [ref,c] of sheet.cells){
  const r=Number(ref.replace(/\D/g,"")),label=String(c.value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toUpperCase();
  if(ref.startsWith("B")&&label==="PROFUNDIDAD (M):"){
   const refs={depth:`C${r}`,dip:`${col("I","J")}${r}`,azimuth:`${col("T","U")}${r}`,reference:`${col("Y","Z")}${r}`,equipment:`${col("AE","AF")}${r}`};
   const depthM=num(sheet,refs.depth),dip=num(sheet,refs.dip),azimuth=num(sheet,refs.azimuth);
   if(depthM===null&&dip===null&&azimuth===null)continue;
   const valid=depthM!==null&&depthM>=0&&dip!==null&&Math.abs(dip)<=90&&azimuth!==null&&azimuth>=0&&azimuth<=360;
   out.survey.push({key:hash(`${key}|survey|${r}`),depthM,dip,azimuth,reference:str(sheet,refs.reference),equipment:str(sheet,refs.equipment),valid,cells:Object.fromEntries(Object.entries(refs).map(([k,c])=>[k,src(sheet,c,k==="depth"?"m":k==="dip"||k==="azimuth"?"°":null)])),warnings:valid?["DIP_CONVENTION_AND_NORTH_REFERENCE_UNCONFIRMED"]:["SURVEY_INCOMPLETE_OR_INVALID"]});
  }
  if(label==="ADITIVOS") for(let rr=r+2;rr<r+5;rr++) for(const [quantity,unit,description] of [[col("O","P"),col("P","Q"),col("S","T")],[col("AC","AD"),col("AE","AF"),col("AF","AG")]]){
   const item=str(sheet,`${description}${rr}`);if(item)add(out.materials,item,`${quantity}${rr}`,str(sheet,`${unit}${rr}`),null,{description:src(sheet,`${description}${rr}`)});
  }
  if(label==="HERRAMIENTAS PERDIDAS EN EL POZO")for(let rr=r+2;rr<r+10;rr++){
   const item=str(sheet,`B${rr}`);if(item)add(out.materials,`Herramienta perdida: ${item}`,`${col("G","H")}${rr}`,null,null,{description:src(sheet,`B${rr}`)});
  }
  if(label.startsWith("ACCESORIOS / CONSUMIBLES"))for(let rr=r+1;rr<=Math.min(r+6,74);rr++){
   const description=ref.replace(/\d/g,""),quantity=description==="B"?col("S","T"):col("AJ","AK"),item=str(sheet,`${description}${rr}`);
   if(item)add(out.materials,item,`${quantity}${rr}`,null,null,{description:src(sheet,`${description}${rr}`)});
  }
  if(label==="EQUIPOS DE TRANSPORTE (HORAS)") for(let rr=r+2;rr<r+10;rr++){
   const item=str(sheet,`B${rr}`);if(!item||item.includes("HERRAMIENTAS"))break;
   add(out.equipmentHours,item,`${col("L","M")}${rr}`,"h",null,{start:src(sheet,`${col("F","G")}${rr}`,"h"),end:src(sheet,`${col("G","H")}${rr}`,"h")},true);
  }
 }
 return out;
}
