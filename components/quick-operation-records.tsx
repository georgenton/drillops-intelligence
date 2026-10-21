"use client";
import {useEffect,useState} from "react";
import type {PrivateSession} from "@/lib/private-auth";
import type {StoredShift} from "@/lib/operational-store";
import {canAccessSection,canWriteManualRecord} from "@/lib/access-control";
import type {QuickRecordKind,StoredQuickRecord} from "@/packages/domain/quick-operation-records";
import {RecordModal} from "./record-modal";

const labels:Record<QuickRecordKind,string>={interval:"Intervalo",event:"Evento",crown_change:"Cambio de corona",consumption:"Consumo"};
const permission={interval:"interval",event:"shift",crown_change:"crown",consumption:"consumable"} as const;
const sections={interval:"intervalos",event:"operacion",crown_change:"coronas",consumption:"consumibles"} as const;
function detail(record:StoredQuickRecord){
 const p=record.payload;
 if("startDepthM" in p)return `${p.startDepthM}–${p.endDepthM} m · ${p.minutes} min`;
 if("label" in p)return `${p.label} · ${p.hours} h${p.time?` · ${p.time}`:""}`;
 if("nextSerial" in p)return `${p.previousSerial??"Saliente no declarada"} → ${p.nextSerial} · ${p.depthM} m${p.time?` · ${p.time}`:""}`;
 return `${p.item} · ${p.quantity} ${p.unit}`;
}
/** Complements a shift; does not manufacture another shift or add its metres/hours again. */
export function QuickOperationRecords({data,session,onSaved}:{data:{shifts:StoredShift[]};session:PrivateSession;onSaved:()=>Promise<void>}){
 const [kind,setKind]=useState<QuickRecordKind|null>(null),[logicalKey,setLogicalKey]=useState("");
 const [requestId,setRequestId]=useState(""),[revision,setRevision]=useState(0),[reason,setReason]=useState("");
 const [fields,setFields]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [records,setRecords]=useState<StoredQuickRecord[]>([]),[listError,setListError]=useState("");
 const [reloadToken,setReloadToken]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  fetch("/api/v2/quick-records",{signal:controller.signal}).then(async r=>{
   if(!r.ok)throw Error("No se pudo leer el detalle complementario.");
   const body=await r.json();setRecords(body.records);setListError("");
  }).catch(e=>{if(e.name!=="AbortError")setListError(e.message);});
  return ()=>controller.abort();
 },[reloadToken,data.shifts]);
 const visible=new Set(data.shifts.map(s=>s.logicalKey));
 const scoped=records.filter(r=>visible.has(r.logicalKey));
 const allowed=(k:QuickRecordKind)=>!session.demo&&canWriteManualRecord(session.role,session.plan,permission[k])&&canAccessSection({...session,section:sections[k]});
 const set=(key:string,value:string)=>setFields(previous=>({...previous,[key]:value}));
 const numeric=(key:string)=>Number(fields[key]);
 const input=(label:string,key:string,options:{type?:string;min?:number;max?:number;optional?:boolean}={})=><label key={key}>{label}<input type={options.type??"text"} required={!options.optional} step={options.type==="number"?"any":undefined} min={options.min} max={options.max} maxLength={options.type==="number"?undefined:160} value={fields[key]??""} disabled={busy} onChange={e=>set(key,e.target.value)}/></label>;
 return <section className="panel supplementary-panel">
  <div><header className="panel-head"><div><h3>Registro rápido por turno</h3><p>Detalle complementario: no duplica avance, horas ni inventario.</p></div></header>
   <div className="quick-links">{(Object.keys(labels) as QuickRecordKind[]).filter(allowed).map(k=><button key={k} aria-label={`Registrar ${labels[k].toLowerCase()}`} disabled={!data.shifts.length} onClick={()=>{
    const shift=data.shifts[0];setKind(k);setLogicalKey(shift.logicalKey);setRevision(shift.revision);setRequestId(crypto.randomUUID());setFields({});setReason("");setError("");
   }}><span aria-hidden="true" style={{fontSize:20,color:"var(--green)"}}>＋</span><b>Registrar {labels[k].toLowerCase()}</b><span>Detalle observado del turno seleccionado</span></button>)}</div>
  </div>
  {listError&&<p role="alert">{listError}</p>}
  {scoped.length>0&&<div className="table-scroll"><table><caption>Detalles guardados del filtro actual</caption><thead><tr><th>Tipo</th><th>Turno</th><th>Registro</th></tr></thead><tbody>{scoped.map(r=>{
   const shift=data.shifts.find(s=>s.logicalKey===r.logicalKey);
   return <tr key={r.id}><td>{labels[r.kind]}</td><td>{shift?.date} · {shift?.rigCode} · {shift?.shiftType==="day"?"Día":"Noche"}</td><td>{detail(r)}</td></tr>;
  })}</tbody></table></div>}
  <RecordModal open={kind!==null} title={`Registrar ${kind?labels[kind].toLowerCase():"detalle"}`} description="Selecciona el turno existente. El detalle queda vinculado a su revisión y autor." submitLabel="Guardar detalle" submitting={busy} error={error} onClose={()=>{if(!busy)setKind(null);}} onSubmit={async event=>{
   event.preventDefault();if(!kind)return;setBusy(true);setError("");
   try{
    const record=kind==="interval"?{startDepthM:numeric("startDepthM"),endDepthM:numeric("endDepthM"),minutes:numeric("minutes")}:
     kind==="event"?{label:fields.label,hours:numeric("hours"),time:fields.time||null}:
     kind==="crown_change"?{previousSerial:fields.previousSerial||null,nextSerial:fields.nextSerial,depthM:numeric("depthM"),time:fields.time||null}:
     {item:fields.item,quantity:numeric("quantity"),unit:fields.unit};
    const response=await fetch("/api/v2/quick-records",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId,logicalKey,shiftRevision:revision,reason,kind,record})});
    const result=await response.json();if(!response.ok)throw Error(result.error??"No se guardó el registro.");
    setReloadToken(v=>v+1);await onSaved();setKind(null);
   }catch(e){setError(e instanceof Error?e.message:"No se guardó el registro.");}finally{setBusy(false);}
  }}>
   <div className="record-grid">
    <label>Turno<select required value={logicalKey} disabled={busy} onChange={e=>{const shift=data.shifts.find(s=>s.logicalKey===e.target.value);if(shift){setLogicalKey(shift.logicalKey);setRevision(shift.revision);setRequestId(crypto.randomUUID());setError("");}}}>
     {data.shifts.map(s=><option key={s.logicalKey} value={s.logicalKey}>{s.date} · {s.rigCode} · {s.holeCode??"Sondeo no declarado"} · {s.shiftType==="day"?"Día":"Noche"} · {s.startDepthM??"?"}–{s.endDepthM??"?"} m</option>)}
    </select></label>
    {kind==="interval"&&<>{input("Profundidad inicial (m)","startDepthM",{type:"number",min:0})}{input("Profundidad final (m)","endDepthM",{type:"number",min:0})}{input("Tiempo de perforación del intervalo (min)","minutes",{type:"number",min:0.01,max:720})}</>}
    {kind==="event"&&<>{input("Actividad o evento","label")}{input("Duración declarada (h)","hours",{type:"number",min:0,max:12})}{input("Hora local declarada (opcional)","time",{type:"time",optional:true})}</>}
    {kind==="crown_change"&&<>{input("Serie saliente (opcional)","previousSerial",{optional:true})}{input("Serie entrante","nextSerial")}{input("Profundidad del cambio (m)","depthM",{type:"number",min:0})}{input("Hora local declarada (opcional)","time",{type:"time",optional:true})}</>}
    {kind==="consumption"&&<>{input("Material o insumo","item")}{input("Cantidad consumida","quantity",{type:"number",min:0.001})}{input("Unidad original (p. ej. L, kg, und)","unit")}</>}
    <label>Motivo / evidencia<textarea required minLength={5} maxLength={500} disabled={busy} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   </div>
   <p className="helper-text">{kind==="interval"?"No se impone longitud de 3 o 1,5 m: registra la longitud real, dentro del turno y sin superposición.":kind==="crown_change"?"Registra el cambio observado; no reescribe fotografías históricas ni atribuye automáticamente toda la perforación a una corona.":kind==="consumption"?"Consumo declarado, no saldo de stock. Los movimientos de inventario se registran aparte.":"El evento detalla el turno; no vuelve a sumar horas ni clasifica automáticamente una avería."}</p>
   {error&&<button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{await onSaved();setKind(null);}finally{setBusy(false);}}}>Recargar turno y cerrar sin reenviar</button>}
  </RecordModal>
 </section>;
}
