import type { OperationalShift } from "@/packages/import/types";
export type DepthTrack="rop"|"pressure"|"torque"|"rpm"|"recovery"|"mse"|"hardness";
export function depthTrackValue(row:OperationalShift,track:DepthTrack):number|null{
 const value=track==="rop"?(row.advanceM!==null&&row.drillingHours!==null&&row.drillingHours>0?row.advanceM/row.drillingHours:null):
  track==="pressure"?row.parameters.pulldownPsi:track==="torque"?row.parameters.torque:track==="rpm"?row.parameters.rpm:null;
 return value!==null&&Number.isFinite(value)&&value>=0?value:null;
}
export function validDepthRange(row:OperationalShift):boolean{
 return row.startDepthM!==null&&row.endDepthM!==null&&Number.isFinite(row.startDepthM)&&Number.isFinite(row.endDepthM)&&row.startDepthM>=0&&row.endDepthM>row.startDepthM;
}
/** Constant observed shift averages over each real range; joins only adjacent same-rig
 * intervals. Nulls, gaps and overlaps start a new segment; never smooth/interpolate. */
export function depthTrackSegments(rows:OperationalShift[],track:DepthTrack){
 const byRig=new Map<string,OperationalShift[]>();
 for(const row of rows){const group=byRig.get(row.rigCode)??[];group.push(row);byRig.set(row.rigCode,group);}
 return [...byRig].map(([rig,group])=>{
  const sorted=group.filter(validDepthRange).sort((a,b)=>a.startDepthM!-b.startDepthM!||a.date.localeCompare(b.date));
  const points:Array<[number,number]|null>=[];let end:number|null=null;
  for(const row of sorted){const value=depthTrackValue(row,track);
   if(value===null){if(points.length)points.push(null);end=null;continue;}
   if(end!==null&&Math.abs(row.startDepthM!-end)>.001)points.push(null);
   points.push([value,row.startDepthM!],[value,row.endDepthM!]);end=row.endDepthM;
  }
  return {rig,points};
 });
}
