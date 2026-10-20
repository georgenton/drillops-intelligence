import {createHash} from "node:crypto";
import type {OperationalImport,OperationalShift,OperationalReport} from "./types";
const stable=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==="object"&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
export type StoredReportState={payload:OperationalReport;revision:number;adapterVersion:string};
export function planOperationalBackfill(current:(OperationalShift&{revision:number})[],parsed:OperationalImport,currentReports:StoredReportState[]=[]){
 const changes:{logicalKey:string;revision:number;previous:OperationalShift;next:OperationalShift;manualCorrectionPreserved:boolean}[]=[];
 const conflicts:string[]=[];
 for(const incoming of parsed.shifts){
  const old=current.find(s=>s.logicalKey===incoming.logicalKey);
  if(!old){conflicts.push(`MISSING_EXISTING_SHIFT:${incoming.logicalKey}`);continue;}
  if(old.source.fileSha256!==incoming.source.fileSha256){conflicts.push(`SOURCE_CHANGED:${incoming.logicalKey}`);continue;}
  const manual=old.warnings.some(w=>w.startsWith("MANUAL_CORRECTION"));
  const {revision,...previous}=old;
  // Only newly recovered fields and activity detail. Never overwrite core
  // measurements, crown identity, decisions or any manual correction.
  const next={...previous,diameter:incoming.diameter,drillingType:incoming.drillingType,barrel:incoming.barrel,observedDip:incoming.observedDip,observedAzimuth:incoming.observedAzimuth,
   activities:manual?previous.activities:incoming.activities,
   source:{...previous.source,cells:{...previous.source.cells,...Object.fromEntries(Object.entries(incoming.source.cells).filter(([k])=>k.startsWith("activity_")||["diameter","drillingType","barrel","observedDip","observedAzimuth"].includes(k))) }},
   warnings:manual?previous.warnings:[...new Set([...previous.warnings.filter(w=>w!=="ACTIVITY_TOTAL_MISMATCH"&&w!=="ACTIVITY_HOURS_AMBIGUOUS"),...incoming.warnings])]
  };
  if(stable(previous)!==stable(next))changes.push({logicalKey:old.logicalKey,revision,previous,next,manualCorrectionPreserved:manual});
 }
 const reportStates=(parsed.operationalReports??[]).map(next=>{
  const old=currentReports.find(r=>r.payload.key===next.key);
  return {logicalKey:next.key,revision:old?.revision??null,adapterVersion:old?.adapterVersion??null,previous:old?.payload??null,next};
 }).sort((a,b)=>a.logicalKey.localeCompare(b.logicalKey));
 const reportChanges=reportStates.filter(r=>stable(r.previous)!==stable(r.next));
 for(const r of reportChanges){
  if(r.adapterVersion?.startsWith("manual"))conflicts.push(`MANUAL_REPORT_CONFLICT:${r.logicalKey}`);
  else if(r.previous&&r.previous.source.fileSha256!==r.next.source.fileSha256)conflicts.push(`REPORT_SOURCE_CHANGED:${r.logicalKey}`);
 }
 // Include unchanged report state too: edits/revision changes after preview
 // invalidate the signed plan rather than slipping through a report-only upsert.
 const digest=createHash("sha256").update(stable({adapterVersion:parsed.adapterVersion,archiveSha256:parsed.archiveSha256,changes,reportStates,conflicts})).digest("hex");
 const reportCounts={inserted:reportChanges.filter(r=>r.previous===null).length,updated:reportChanges.filter(r=>r.previous!==null).length,unchanged:reportStates.length-reportChanges.length};
 return {adapterVersion:parsed.adapterVersion,archiveSha256:parsed.archiveSha256,digest,changes,conflicts,reportCount:reportStates.length,reportCounts,reportChanges};
}
