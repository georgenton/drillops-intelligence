import type { OperationalShift } from "@/packages/import/types";
import type { OperationalCatalog } from "./operational-catalog";
/** One series per equipment/guard. Missing reports remain null, never production zero. */
export function guardiaSeries(shifts:OperationalShift[],catalog:OperationalCatalog|null,filter:{from?:string;to?:string}={}){
 const observed=[...new Set(shifts.map(s=>s.date))].sort();
 const start=filter.from||observed[0],end=filter.to||observed.at(-1);
 const dates:string[]=[];
 if(start&&end&&start<=end){const cursor=new Date(`${start}T00:00:00Z`),last=new Date(`${end}T00:00:00Z`);while(cursor<=last){dates.push(cursor.toISOString().slice(0,10));cursor.setUTCDate(cursor.getUTCDate()+1);}}
 const rigs=[...new Set(shifts.map(s=>s.rigCode))].sort();
 const series: Array<{name:string;color:string;type?:string;values:(number|null)[]}>=[];
 for(const rig of rigs){
  for(const type of ["day","night"] as const)series.push({name:`${rig} · ${type==="day"?"Día":"Noche"}`,color:type==="day"?"#41d6a3":"#2389ba",values:dates.map(date=>{
   const values=shifts.filter(s=>s.rigCode===rig&&s.date===date&&s.shiftType===type).map(s=>s.advanceM).filter((v):v is number=>v!==null&&Number.isFinite(v));
   return values.length?values.reduce((s,v)=>s+v,0):null;
  })});
  const knownHoles=[...new Set(shifts.filter(s=>s.rigCode===rig).map(s=>s.holeCode).filter(Boolean))];
  series.push({name:`${rig} · Meta/guardia`,color:"#d7ff43",type:"line",values:dates.map(date=>{
   const dayHoles=[...new Set(shifts.filter(s=>s.rigCode===rig&&s.date===date).map(s=>s.holeCode))];
   const context=dayHoles.length?dayHoles:knownHoles;
   if(context.length!==1||!context[0])return null;
   const plans=catalog?.holes.filter(h=>h.code===context[0]!.toUpperCase()&&h.rigCode===rig.toUpperCase())??[];
   const plan=plans.length===1?plans[0]:null;
   return plan?.planStartDate&&date>=plan.planStartDate?plan.plannedMetersPerShift:null;
  })});
 }
 return {dates,series};
}
