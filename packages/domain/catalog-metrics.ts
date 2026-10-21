import type { OperationalShift } from "@/packages/import/types";
import type { OperationalCatalog } from "./operational-catalog";

const code=(value:string|null|undefined)=>(value??"").trim().toUpperCase();
const dayNumber=(date:string)=>Date.parse(`${date}T00:00:00Z`)/86400000;
export function programmedMetres(catalog:OperationalCatalog|null,holes:string[],dates:string[]) {
  const unique=[...new Set(holes.map(code).filter(Boolean))];
  if(!catalog||!unique.length)return dates.map(()=>null);
  const plans=unique.map(h=>catalog.holes.find(p=>p.code===h&&p.source==="configured"));
  if(plans.some(p=>!p||p.plannedMetersPerShift===null||p.guardsPerDay===null||p.planStartDate===null))return dates.map(()=>null);
  return dates.map(date=>plans.reduce((sum,p)=>sum+Math.max(0,dayNumber(date)-Math.max(dayNumber(p!.planStartDate!),dayNumber(dates[0]))+1)*p!.plannedMetersPerShift!*p!.guardsPerDay!,0));
}

/** No unconfigured rig, unknown hour, or unclassified activity becomes zero downtime. */
export function mechanicalAvailability(shifts:OperationalShift[],catalog:OperationalCatalog|null) {
  if(!catalog||!shifts.length)return {value:null,coveredShifts:0,totalShifts:shifts.length,downtimeHours:null};
  const covered=shifts.filter(s=>{
    const rig=catalog.rigs.find(r=>r.code===code(s.rigCode));
    return rig?.mechanicalDowntimeActivities!==null&&rig?.mechanicalClassificationEvidence
      && s.totalHours===12 && s.activities.every(a=>a.hours!==null&&a.hours>=0)
      && Math.abs(s.activities.reduce((sum,a)=>sum+a.hours!,0)-12)<.001;
  });
  if(!covered.length)return {value:null,coveredShifts:0,totalShifts:shifts.length,downtimeHours:null};
  const downtime=covered.reduce((sum,s)=>{
    const labels=catalog.rigs.find(r=>r.code===code(s.rigCode))!.mechanicalDowntimeActivities!;
    return sum+s.activities.filter(a=>labels.some(label=>code(label)===code(a.label))).reduce((sum,a)=>sum+a.hours!,0);
  },0);
  return {value:(1-downtime/(covered.length*12))*100,coveredShifts:covered.length,totalShifts:shifts.length,downtimeHours:downtime};
}

/** Rig component of the original estimate. Crown component remains separate/unavailable. */
export function rigEstimatePerMetre(shifts:OperationalShift[],catalog:OperationalCatalog|null) {
  if(!catalog||!shifts.length)return null;
  if(shifts.some(s=>s.advanceM===null||s.drillingHours===null||catalog.rigs.find(r=>r.code===code(s.rigCode))?.hourlyCostUsd==null))return null;
  const metres=shifts.reduce((sum,s)=>sum+s.advanceM!,0);
  return metres>0?shifts.reduce((sum,s)=>sum+s.drillingHours!*catalog.rigs.find(r=>r.code===code(s.rigCode))!.hourlyCostUsd!,0)/metres:null;
}
