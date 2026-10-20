"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Plus, Target, Wrench } from "lucide-react";
import type { OperationalCatalog, HoleCatalogRecord, RigCatalogRecord } from "@/packages/domain/operational-catalog";
import type { RecoveredData } from "./recovered-operational-views";
import { RecordModal } from "./record-modal";
import { observedDepth } from "@/packages/domain/operational-display";
import type { PrivateSession } from "@/lib/private-auth";
import { canAccessSection } from "@/lib/access-control";

const CatalogContext = createContext<{ catalog: OperationalCatalog | null; error: string; refresh: () => Promise<void> }>({catalog:null,error:"",refresh:async()=>{}});
export function OperationalCatalogProvider({ children }: { children: ReactNode }) {
  const [catalog,setCatalog]=useState<OperationalCatalog|null>(null);
  const [error,setError]=useState("");
  const refresh=useCallback(async()=>{
    const response=await fetch("/api/v2/catalog",{cache:"no-store"});
    if(!response.ok)throw Error("No se pudo consultar el catálogo autorizado.");
    setCatalog(await response.json());setError("");
  },[]);
  useEffect(()=>{let active=true;fetch("/api/v2/catalog",{cache:"no-store"}).then(async r=>{
    if(!r.ok)throw Error("No se pudo consultar el catálogo autorizado.");
    return r.json() as Promise<OperationalCatalog>;
  }).then(value=>{if(active)setCatalog(value);}).catch(cause=>{if(active)setError(cause.message);});return()=>{active=false;};},[]);
  return <CatalogContext.Provider value={{catalog,error,refresh}}>{children}</CatalogContext.Provider>;
}
export const useOperationalCatalog=()=>useContext(CatalogContext);
const fmt=(n:number|null|undefined)=>n==null?"—":new Intl.NumberFormat("es-EC",{maximumFractionDigits:2}).format(n);

export function OperationalCatalogView({kind,data,session}:{kind:"rig"|"hole";data:RecoveredData;session?:PrivateSession}) {
  const {catalog,error,refresh}=useOperationalCatalog();
  const [editing,setEditing]=useState<RigCatalogRecord|HoleCatalogRecord|null>(null);
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[failure,setFailure]=useState("");
  const [query,setQuery]=useState("");
  const [configureSurvey,setConfigureSurvey]=useState(false);
  if(!catalog)return <p role={error?"alert":"status"}>{error||"Cargando catálogo…"}</p>;
  const writable=kind==="rig"?catalog.canWriteRigs:catalog.canWriteHoles;
  const surveyWritable=writable&&Boolean(session&&!session.demo&&canAccessSection({...session,section:"survey"}));
  const entries=(kind==="rig"?catalog.rigs:catalog.holes).filter(r=>r.code.toLowerCase().includes(query.toLowerCase()));
  const selectedHole=editing&&"rigCode" in editing?editing:null;
  const selectedRig=editing&&!("rigCode" in editing)?editing:null;
  return <>
    <div className="actionbar"><label>Buscar {kind==="rig"?"taladro":"sondeo"}<input value={query} onChange={e=>setQuery(e.target.value)}/></label>
      {writable&&<button className="primary-btn" onClick={()=>{setEditing(null);setConfigureSurvey(false);setFailure("");setOpen(true);}}><Plus/>{kind==="rig"?"Registrar taladro":"Nuevo sondeo"}</button>}
    </div>
    {notice&&<p role="status">{notice}</p>}
    <div className={`cards-grid ${kind==="rig"?"rigs-grid":""}`}>{entries.map(entry=>{
      const hole="rigCode" in entry?entry:null,rig=hole?null:entry as RigCatalogRecord;
      const rows=data.shifts.filter(s=>hole?s.holeCode?.toUpperCase()===hole.code:s.rigCode.toUpperCase()===entry.code);
      const depth=hole?observedDepth(rows):null;
      const percent=hole?.targetDepthM&&depth!==null?depth/hole.targetDepthM*100:null;
      return <article className={hole?"hole-card":"rig-card"} key={`${entry.code}|${hole?.rigCode??""}`}>
        <header><div><span className="status">{entry.source==="configured"?"CONFIGURADO":"OBSERVADO EN REPORTES"}</span><h3>{entry.code}</h3><p>{rig?[rig.name,rig.model].filter(Boolean).join(" · ")||"Identificación por completar":hole?.rigCode}</p></div>{hole?<Target/>:<Wrench/>}</header>
        {hole&&<div className="hole-depth"><div><span style={{width:`${Math.min(100,percent??0)}%`}}/></div><b>{fmt(depth)} m</b><small> / {fmt(hole.targetDepthM)} m objetivo · {fmt(percent)}%</small></div>}
        <dl><dt>Estado declarado</dt><dd>{entry.status??"No declarado"}</dd>
          {hole?<><dt>Meta por guardia</dt><dd>{fmt(hole.plannedMetersPerShift)} m</dd><dt>Guardias por día</dt><dd>{hole.guardsPerDay??"No declaradas"}</dd><dt>Inicio de programación</dt><dd>{hole.planStartDate??"No declarado"}</dd></>:<>
            <dt>Avance observado</dt><dd>{fmt(rows.length?rows.reduce((sum,s)=>sum+(s.advanceM??0),0):null)} m</dd>
            {"hourlyCostUsd" in entry&&<><dt>Tarifa configurada USD/h</dt><dd>{fmt(rig?.hourlyCostUsd)}</dd></>}
          </>}
          <dt>Revisión de ficha</dt><dd>{entry.revision||"Sin ficha configurada"}</dd>
        </dl>
        <footer>{writable&&<button onClick={()=>{setEditing(entry);setConfigureSurvey(Boolean(hole?.surveyConfiguration));setFailure("");setOpen(true);}}>Configurar {hole?"sondeo y metas":"taladro"}</button>}
          <Link href={`${hole?"/depth-intelligence":"/operacion"}?${new URLSearchParams({...data.filters,[hole?"hole":"rig"]:entry.code})}`}>Ver operación</Link>
        </footer>
      </article>;
    })}</div>
    <RecordModal open={open} title={kind==="rig"?"Ficha de taladro":"Ficha de sondeo y programación"}
      description="Configuración declarada y versionada. No modifica los reportes históricos ni inventa metas o tarifas."
      submitLabel="Guardar ficha" submitting={busy} error={failure} onClose={()=>setOpen(false)}
      onSubmit={async event=>{
        event.preventDefault();setBusy(true);setFailure("");
        const form=new FormData(event.currentTarget);
        const text=(key:string)=>String(form.get(key)??"").trim();
        const optional=(key:string)=>text(key)||null;
        const number=(key:string)=>text(key)===""?null:Number(text(key));
        const record=kind==="rig"?{
          code:text("code"),name:optional("name"),model:optional("model"),status:optional("status"),
          mechanicalDowntimeActivities:text("mechanicalClassificationEvidence")?text("mechanicalDowntimeActivities").split("\n").map(s=>s.trim()).filter(Boolean):null,
          mechanicalClassificationEvidence:optional("mechanicalClassificationEvidence"),
          ...(catalog.canConfigureCosts?{hourlyCostUsd:number("hourlyCostUsd")}:{})
        }:{
          code:text("code"),rigCode:text("rigCode"),status:optional("status"),targetDepthM:number("targetDepthM"),
          plannedMetersPerShift:number("plannedMetersPerShift"),planStartDate:optional("planStartDate"),guardsPerDay:number("guardsPerDay"),
          surveyConfiguration:surveyWritable?(configureSurvey?{
            angleConvention:text("surveyAngle"),azimuthReference:text("surveyNorth"),method:text("surveyMethod"),
            anchor:{depthM:number("surveyDepth"),eastM:number("surveyEast"),northM:number("surveyNorthCoordinate"),tvdM:number("surveyTvd")},
            evidence:text("surveyEvidence"),
          }:null):selectedHole?.surveyConfiguration??null,
        };
        try{
          const response=await fetch("/api/v2/catalog",{method:editing?.revision?"PATCH":"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({kind,record,reason:text("reason"),...(editing?.revision?{revision:editing.revision}:{})})});
          const result=await response.json();
          if(!response.ok)throw Error(result.error??"No se pudo guardar. Si cambió la revisión, cierra y recarga antes de editar.");
          await refresh();setOpen(false);setNotice("Ficha guardada. Los indicadores usarán los valores declarados.");
        }catch(cause){setFailure(cause instanceof Error?cause.message:"No se pudo guardar.");}finally{setBusy(false);}
      }}>
      <div className="record-grid" key={`${kind}|${editing?.code??"new"}|${open}`}>
        <label>Código<input name="code" required maxLength={80} readOnly={Boolean(editing)} defaultValue={editing?.code??""}/></label>
        {kind==="rig"?<>
          <label>Nombre / fabricante<input name="name" maxLength={160} defaultValue={selectedRig?.name??""}/></label>
          <label>Modelo<input name="model" maxLength={160} defaultValue={selectedRig?.model??""}/></label>
          <label>Estado<select name="status" defaultValue={selectedRig?.status??""}><option value="">No declarado</option><option value="operating">Operativo</option><option value="maintenance">Mantenimiento</option><option value="inactive">Inactivo</option></select></label>
          {catalog.canConfigureCosts&&<label>Tarifa declarada (USD/h)<input name="hourlyCostUsd" type="number" min="0" step="any" defaultValue={selectedRig?.hourlyCostUsd??""}/></label>}
          <label className="span-2">Actividades que representan indisponibilidad mecánica (una por línea)<textarea name="mechanicalDowntimeActivities" defaultValue={selectedRig?.mechanicalDowntimeActivities?.join("\n")??""}/></label>
          <label className="span-2">Criterio y evidencia de clasificación mecánica<textarea name="mechanicalClassificationEvidence" minLength={5} maxLength={1000} defaultValue={selectedRig?.mechanicalClassificationEvidence??""}/></label>
          <p>Usa los rótulos exactos del reporte. Sin evidencia, la disponibilidad permanece pendiente. Una lista vacía con evidencia declara expresamente que ninguna actividad registrada corresponde a indisponibilidad mecánica.</p>
        </>:<>
          <label>Taladro asignado<select name="rigCode" required defaultValue={selectedHole?.rigCode??""}><option value="">Seleccionar</option>{catalog.rigs.map(r=><option key={r.code}>{r.code}</option>)}</select></label>
          <label>Profundidad objetivo (m)<input name="targetDepthM" type="number" min="0" step="any" defaultValue={selectedHole?.targetDepthM??""}/></label>
          <label>Meta por guardia (m)<input name="plannedMetersPerShift" type="number" min="0" step="any" defaultValue={selectedHole?.plannedMetersPerShift??""}/></label>
          <label>Inicio de programación<input name="planStartDate" type="date" defaultValue={selectedHole?.planStartDate??""}/></label>
          <label>Guardias programadas por día<select name="guardsPerDay" defaultValue={selectedHole?.guardsPerDay??""}><option value="">No declarado</option><option value="1">1</option><option value="2">2</option></select></label>
          <label>Estado<select name="status" defaultValue={selectedHole?.status??""}><option value="">No declarado</option><option value="planned">Planificado</option><option value="active">Activo</option><option value="completed">Completado</option><option value="paused">Pausado</option></select></label>
          {surveyWritable&&<fieldset className="span-2" style={{display:"grid",gap:12}}>
            <legend>Configuración Survey confirmada</legend>
            <label><input type="checkbox" checked={configureSurvey} onChange={e=>setConfigureSurvey(e.target.checked)}/> Registrar configuración espacial respaldada por evidencia</label>
            <p>Sin confirmación, se conservan mediciones y perfil 2D, pero no se calcula trayectoria real. Desmarcar elimina la configuración anterior al guardar y queda auditado.</p>
            {configureSurvey&&<>
              <label>Convención angular Survey<select name="surveyAngle" required defaultValue={selectedHole?.surveyConfiguration?.angleConvention??""}><option value="">Confirmar convención</option><option value="inclination_from_vertical">Inclinación desde vertical descendente (0°–180°)</option><option value="dip_negative_down">DIP negativo hacia abajo (−90° vertical)</option><option value="dip_positive_down">DIP positivo hacia abajo (+90° vertical)</option></select></label>
              <label>Referencia de norte Survey<select name="surveyNorth" required defaultValue={selectedHole?.surveyConfiguration?.azimuthReference??""}><option value="">Confirmar referencia</option><option value="true_north">Norte verdadero</option><option value="magnetic_north">Norte magnético, sin corrección</option><option value="grid_north">Norte de cuadrícula</option></select></label>
              <label>Método de trayectoria<select name="surveyMethod" required defaultValue={selectedHole?.surveyConfiguration?.method??""}><option value="">Confirmar método</option><option value="minimum_curvature">Curvatura mínima</option></select></label>
              <label>Anclaje MD (m)<input name="surveyDepth" type="number" min="0" step="any" required defaultValue={selectedHole?.surveyConfiguration?.anchor.depthM??""}/></label>
              <label>Anclaje Este (m)<input name="surveyEast" type="number" step="any" required defaultValue={selectedHole?.surveyConfiguration?.anchor.eastM??""}/></label>
              <label>Anclaje Norte (m)<input name="surveyNorthCoordinate" type="number" step="any" required defaultValue={selectedHole?.surveyConfiguration?.anchor.northM??""}/></label>
              <label>Anclaje TVD (m)<input name="surveyTvd" type="number" step="any" required defaultValue={selectedHole?.surveyConfiguration?.anchor.tvdM??""}/></label>
              <label>Evidencia de convención y origen<textarea name="surveyEvidence" required minLength={5} maxLength={1000} defaultValue={selectedHole?.surveyConfiguration?.evidence??""}/></label>
              <p>El anclaje debe coincidir con la primera estación medida del alcance seleccionado. No se asume collar ni se extrapola. El norte magnético no se convierte automáticamente a verdadero. Indique si el origen es local o topográfico.</p>
            </>}
          </fieldset>}
        </>}
        <label>Motivo de configuración<input name="reason" required minLength={5} maxLength={500}/></label>
      </div>
    </RecordModal>
  </>;
}
