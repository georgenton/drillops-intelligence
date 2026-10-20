"use client";
import { useState, type FormEvent } from "react";
import { Download, Plus } from "lucide-react";
import { RecordModal, RecordNotice } from "./record-modal";
import { canAccessSection, canWriteManualRecord } from "@/lib/access-control";
import type { PrivateSession } from "@/lib/private-auth";
import { CaptureMeasurements, type CaptureMeasurement } from "./capture-measurements";

export function PrivateRecordActions({section,session,onSaved,filters={}}:{section:string;session:PrivateSession;onSaved:()=>void;filters?:{from?:string;to?:string;rig?:string;hole?:string}}){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState("");
  const [activities,setActivities]=useState([{label:"PERFORACIÓN",hours:""}]);
  const [consumptions,setConsumptions]=useState([{label:"",value:"",unit:"",mode:"direct",start:"",end:""}]);
  const [survey,setSurvey]=useState([{depthM:"",dip:"",azimuth:"",reference:"",equipment:""}]);
  const [materials,setMaterials]=useState<CaptureMeasurement[]>([]);
  const [fluidParameters,setFluidParameters]=useState<CaptureMeasurement[]>([]);
  const [equipment,setEquipment]=useState<{label:string;start:string;end:string}[]>([]);
  const canWrite=!session.demo&&canWriteManualRecord(session.role,session.plan,"shift");
  const canCrown=canWriteManualRecord(session.role,session.plan,"crown");
  const canSurvey=canAccessSection({...session,section:"survey"});
  const canConsumptions=canAccessSection({...session,section:"consumibles"})&&canWriteManualRecord(session.role,session.plan,"consumable");
  const canExport=canAccessSection({...session,section:"reportes"});
  const captureSections=["turnos","intervalos","coronas","consumibles","survey","operacion"];
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError(null);
    const form=new FormData(event.currentTarget);const value=(key:string)=>String(form.get(key)??"").trim();const number=(key:string)=>value(key)===""?null:Number(value(key));
    try{
      const response=await fetch("/api/v2/capture",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({date:value("date"),rigCode:value("rigCode"),holeCode:value("holeCode"),shiftType:value("shiftType"),startDepthM:number("startDepthM"),endDepthM:number("endDepthM"),diameter:value("diameter")||null,projectCode:value("projectCode")||null,drillingType:value("drillingType")||null,barrel:value("barrel")||null,observedDip:number("observedDip"),observedAzimuth:number("observedAzimuth"),materials:canConsumptions?materials.map(m=>({...m,value:Number(m.value),unit:m.unit.trim()||null})):[],fluidParameters:fluidParameters.map(m=>({...m,value:Number(m.value),unit:m.unit.trim()||null})),equipmentHours:equipment.map(m=>({...m,start:Number(m.start),end:Number(m.end)})),observations:value("observations")||null,activities:activities.map(a=>({...a,hours:Number(a.hours)})),parameters:{rpm:number("rpm"),torque:number("torque"),pulldownPsi:number("pulldownPsi"),holdbackPsi:number("holdbackPsi")},consumptions:canConsumptions?consumptions.filter(c=>c.label||c.value||c.unit||c.start||c.end).map(c=>c.mode==="readings"?{label:c.label,unit:c.unit,mode:"readings",start:Number(c.start),end:Number(c.end)}:{label:c.label,unit:c.unit,value:Number(c.value)}):[],survey:canSurvey?survey.filter(s=>Object.values(s).some(Boolean)).map(s=>({...s,depthM:Number(s.depthM),dip:Number(s.dip),azimuth:Number(s.azimuth)})):[],crown:canCrown&&value("serial")?{serial:value("serial"),type:value("crownType"),brand:value("brand")||null}:null,reason:value("reason")})});
      const result=await response.json();if(!response.ok)throw new Error(result.error??"No se guardó");
      setOpen(false);setNotice("Turno guardado y datos actualizados. Si no aparece, revisa el filtro de fechas.");onSaved();
    }catch(e){setError(e instanceof Error?e.message:"No se guardó el turno");}finally{setBusy(false);}
  }
  const query=new URLSearchParams(Object.entries(filters).filter((entry):entry is [string,string]=>Boolean(entry[1]))).toString();
  return <><div className="actionbar">
    {canExport&&<a className="secondary-btn" href={`/api/v2/export?${query}`} download><Download size={18}/> Exportar XLSX</a>}
    {canWrite&&captureSections.includes(section)&&<button className="primary-btn" onClick={()=>{setOpen(true);setError(null);}}><Plus size={18}/> Nuevo turno online</button>}
  </div>{notice&&<RecordNotice>{notice}</RecordNotice>}
  <RecordModal open={open} title="Registrar turno operacional" description="Captura online de una guardia nueva. No modifica turnos importados. Las actividades deben sumar 12 h; lo no perforado no se clasifica automáticamente como NPT." submitLabel="Guardar turno" submitting={busy} error={error} onClose={()=>setOpen(false)} onSubmit={submit}>
    <div className="record-grid">
    <label>Fecha<input name="date" type="date" required/></label><label>Taladro<input name="rigCode" defaultValue={filters.rig??""} maxLength={100} required/></label><label>Sondeo<input name="holeCode" defaultValue={filters.hole??""} maxLength={100} required/></label>
    <label>Guardia<select name="shiftType"><option value="day">Día</option><option value="night">Noche</option></select></label>
    <label>Proyecto declarado<input name="projectCode" maxLength={100}/></label>
    <label>Tipo de perforación declarado<input name="drillingType" maxLength={100}/></label>
    <label>Barril declarado<input name="barrel" maxLength={100}/></label>
    <label>DIP de la guardia (°)<input name="observedDip" type="number" min="-90" max="90" step="any"/></label>
    <label>Azimut de la guardia (°)<input name="observedAzimuth" type="number" min="0" max="359.999999" step="any"/></label>
    <label>Desde (m)<input name="startDepthM" type="number" step="any" min="0" required/></label><label>Hasta (m)<input name="endDepthM" type="number" step="any" min="0" required/></label><label>Diámetro / tipo declarado<input name="diameter" placeholder="Ej. HQ" maxLength={100}/></label>
    <fieldset className="span-2"><legend>Actividades — reparto observado, no orden horario</legend>{activities.map((a,i)=><div className="record-grid" key={i}><label>Actividad {i+1}<input aria-label={`Actividad ${i+1}`} value={a.label} readOnly={i===0} maxLength={100} required onChange={e=>setActivities(activities.map((v,j)=>j===i?{...v,label:e.target.value}:v))}/></label><label>Horas<input aria-label={`Horas actividad ${i+1}`} type="number" step="any" min="0" max="12" required value={a.hours} onChange={e=>setActivities(activities.map((v,j)=>j===i?{...v,hours:e.target.value}:v))}/></label>{i>0&&<button type="button" onClick={()=>setActivities(activities.filter((_,j)=>j!==i))}>Quitar actividad</button>}</div>)}<button type="button" onClick={()=>setActivities([...activities,{label:"",hours:""}])}>Añadir actividad</button></fieldset>
    <fieldset className="span-2"><legend>Parámetros observados — opcionales</legend>{[["rpm","RPM"],["torque","Torque (unidad no confirmada)"],["pulldownPsi","Pulldown (PSI)"],["holdbackPsi","Holdback (PSI)"]].map(([name,label])=><label key={name}>{label}<input name={name} type="number" step="any" min="0"/></label>)}</fieldset>
    {canConsumptions&&<fieldset className="span-2"><legend>Consumos de esta guardia — unidad de origen</legend>{consumptions.map((c,i)=><div className="record-grid" key={i}>
      <label>Modo de consumo<select value={c.mode} onChange={e=>setConsumptions(consumptions.map((v,j)=>j===i?{...v,mode:e.target.value,value:"",start:"",end:""}:v))}><option value="direct">Cantidad directa</option><option value="readings">Diferencia de lecturas (agua / combustible)</option></select></label>
      {(["label","unit",...(c.mode==="readings"?["start","end"]:["value"])] as Array<"label"|"unit"|"start"|"end"|"value">).map(key=><label key={key}>{{label:"Concepto",value:"Cantidad",unit:"Unidad",start:"Lectura inicial",end:"Lectura final"}[key]}<input type={["value","start","end"].includes(key)?"number":"text"} step="any" min={["value","start","end"].includes(key)?0:undefined} value={c[key]} required={Boolean(c.label||c.value||c.unit||c.start||c.end||c.mode==="readings")} onChange={e=>setConsumptions(consumptions.map((v,j)=>j===i?{...v,[key]:e.target.value}:v))}/></label>)}
      {c.mode==="readings"&&<output>Cantidad calculada: {c.start!==""&&c.end!==""?Number(c.end)-Number(c.start):"—"} {c.unit}</output>}
      <button type="button" onClick={()=>setConsumptions(consumptions.filter((_,j)=>j!==i))}>Quitar consumo</button>
    </div>)}<button type="button" onClick={()=>setConsumptions([...consumptions,{label:"",value:"",unit:"",mode:"direct",start:"",end:""}])}>Añadir consumo</button></fieldset>}
    {canCrown&&<fieldset className="span-2"><legend>Corona única atribuida a esta guardia — opcional</legend><label>Serie<input name="serial" maxLength={100}/></label><label>Tipo<input name="crownType" maxLength={100}/></label><label>Marca<input name="brand" maxLength={100}/></label><p>No registrar aquí dos coronas simultáneas ni un snapshot de vida acumulada.</p></fieldset>}
    {canSurvey&&<fieldset className="span-2"><legend>Survey observado — opcional; sin inferir norte verdadero</legend>{survey.map((s,i)=><div className="record-grid" key={i}>{(["depthM","dip","azimuth","reference","equipment"] as const).map(key=><label key={key}>{{depthM:"Profundidad (m)",dip:"DIP (°)",azimuth:"Azimut (°)",reference:"Referencia declarada",equipment:"Equipo"}[key]}<input type={["depthM","dip","azimuth"].includes(key)?"number":"text"} step="any" value={s[key]} required={Object.values(s).some(Boolean)} onChange={e=>setSurvey(survey.map((v,j)=>j===i?{...v,[key]:e.target.value}:v))}/></label>)}</div>)}<button type="button" onClick={()=>setSurvey([...survey,{depthM:"",dip:"",azimuth:"",reference:"",equipment:""}])}>Añadir estación</button></fieldset>}
    {canConsumptions&&<CaptureMeasurements title="Materiales y accesorios" rows={materials} setRows={setMaterials}/>}
    <CaptureMeasurements title="Parámetros de fluidos" rows={fluidParameters} setRows={setFluidParameters}/>
    <fieldset className="span-2"><legend>Horómetros y equipos de transporte</legend>{equipment.map((row,i)=><div className="record-grid" key={i}>
      <label>Equipo / horómetro<input aria-label={`Horómetro ${i+1} equipo`} maxLength={100} required value={row.label} onChange={e=>setEquipment(equipment.map((v,j)=>j===i?{...v,label:e.target.value}:v))}/></label>
      <label>Lectura inicial (h)<input aria-label={`Horómetro ${i+1} inicial`} type="number" min="0" step="any" required value={row.start} onChange={e=>setEquipment(equipment.map((v,j)=>j===i?{...v,start:e.target.value}:v))}/></label>
      <label>Lectura final (h)<input aria-label={`Horómetro ${i+1} final`} type="number" min="0" step="any" required value={row.end} onChange={e=>setEquipment(equipment.map((v,j)=>j===i?{...v,end:e.target.value}:v))}/></label>
      <output>Horas calculadas: {row.start!==""&&row.end!==""?Number(row.end)-Number(row.start):"—"}</output>
      <button type="button" onClick={()=>setEquipment(equipment.filter((_,j)=>j!==i))}>Quitar horómetro</button>
    </div>)}<button type="button" onClick={()=>setEquipment([...equipment,{label:"",start:"",end:""}])}>Añadir horómetro</button></fieldset>
    <label className="span-2">Observaciones operacionales (sin datos personales)<textarea name="observations" maxLength={2000}/></label>
    <label>Motivo / referencia de captura<input name="reason" minLength={5} maxLength={300} required placeholder="Registro de guardia observado"/></label>
    </div>
  </RecordModal></>;
}
