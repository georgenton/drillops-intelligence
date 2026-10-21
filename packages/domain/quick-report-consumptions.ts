import type {OperationalReport, OperationalShift} from "@/packages/import/types";
import type {StoredQuickRecord} from "./quick-operation-records";

/** Read projection only: never changes shift totals or creates synthetic report keys.
 * Unmatched consumption remains in the quick journal. Attachments require an existing
 * persisted report key, not a virtual date/rig grouping.
 */
export function appendQuickConsumptions(reports:OperationalReport[],shifts:OperationalShift[],records:StoredQuickRecord[]):OperationalReport[]{
 const scoped=new Map(shifts.map(shift=>[shift.logicalKey,shift]));
 const result=reports.map(report=>({...report,consumptions:[...report.consumptions]}));
 for(const record of records){
  if(record.kind!=="consumption")continue;
  const shift=scoped.get(record.logicalKey);if(!shift)continue;
  // Multiple source reports may describe a day. Attribute once, deterministically.
  const report=result.filter(report=>report.date===shift.date&&report.rigCode===shift.rigCode&&report.holeCode===shift.holeCode).sort((a,b)=>a.key.localeCompare(b.key))[0];
  if(!report||report.consumptions.some(item=>item.key===`quick:${record.id}`))continue;
  const payload=record.payload as {item:string;quantity:number;unit:string};
  report.consumptions.push({key:`quick:${record.id}`,label:payload.item,value:payload.quantity,unit:payload.unit,shiftType:shift.shiftType,validity:"observed",cells:{},warnings:[`Registro complementario manual ${record.id}; turno ${record.logicalKey}. No altera el consumo del archivo fuente ni el inventario.`]});
 }
 return result;
}
