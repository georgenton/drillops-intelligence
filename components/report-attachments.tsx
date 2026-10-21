"use client";
/* Private authenticated images deliberately bypass Next's public image optimizer. */
/* eslint-disable @next/next/no-img-element */
import { useEffect,useState,type FormEvent } from "react";
import type { ReportAttachment } from "@/packages/domain/private-attachment";
export function ReportAttachments({reportKey}:{reportKey:string}){
  const [items,setItems]=useState<ReportAttachment[]>([]),[canWrite,setCanWrite]=useState(false),[error,setError]=useState(""),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  useEffect(()=>{const controller=new AbortController();fetch(`/api/v2/report-attachments?${new URLSearchParams({reportKey})}`,{cache:"no-store",signal:controller.signal}).then(async response=>{const body=await response.json();if(!response.ok)throw Error(body.error);return body;}).then(body=>{setItems(body.attachments);setCanWrite(body.canWrite);setError("");}).catch(error=>{if(!controller.signal.aborted)setError(error.message);});return()=>controller.abort();},[reportKey,revision]);
  async function upload(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const form=event.currentTarget,payload=new FormData(form);payload.set("reportKey",reportKey);setBusy(true);setError("");
    try{const response=await fetch("/api/v2/report-attachments",{method:"POST",body:payload});const body=await response.json();if(!response.ok)throw Error(body.error);form.reset();setRevision(v=>v+1);}
    catch(error){setError(error instanceof Error?error.message:"No se pudo adjuntar.");}finally{setBusy(false);}
  }
  // A keyed boundary in the wrapper prevents another report's images persisting while loading.
  return <section className="panel report-attachment" style={{padding:20}}><h3>Adjuntos privados del reporte</h3><p>PNG / JPEG / PDF, máximo 3 MiB por archivo. Acceso autenticado; PDF descargable, no se ejecuta dentro del reporte. Las imágenes del reporte seleccionado se incluyen en impresión.</p>
    {error&&<p role="alert">{error}</p>}
    {canWrite&&<form className="no-print" onSubmit={upload} style={{display:"flex",gap:12,flexWrap:"wrap"}}><label>Archivo<input name="file" type="file" accept="image/png,image/jpeg,application/pdf" required/></label><label>Motivo / descripción<input name="reason" required minLength={5} maxLength={500}/></label><button className="button primary" disabled={busy}>{busy?"Adjuntando…":"Guardar adjunto privado"}</button></form>}
    {!items.length&&!error&&<p>No hay adjuntos cargados para este reporte.</p>}
    {items.filter(item=>item.reportKey===reportKey).map(item=><figure key={item.id} style={{breakInside:"avoid",margin:"20px 0"}}>{item.mime.startsWith("image/")?<img src={`/api/v2/report-attachments/${item.id}`} alt={item.reason} style={{maxWidth:"100%",maxHeight:600,objectFit:"contain"}}/>:null}<figcaption><a href={`/api/v2/report-attachments/${item.id}`} target="_blank" rel="noreferrer">{item.name}</a> · {item.reason} · {(item.size/1024).toFixed(1)} KiB{item.mime==="application/pdf"?" · PDF privado: descargar e imprimir por separado":""}</figcaption></figure>)}
  </section>;
}
export function ReportAttachmentPanel({reports}:{reports:{key:string;date:string;rigCode:string;holeCode:string|null}[]}){
  const [selected,setSelected]=useState("");
  const key=reports.some(r=>r.key===selected)?selected:reports[0]?.key;
  return <>{reports.length?<label className="no-print">Reporte operacional para adjuntos<select aria-label="Reporte para adjuntos" value={key} onChange={e=>setSelected(e.target.value)}>{reports.map(r=><option key={r.key} value={r.key}>{r.date} · {r.rigCode} · {r.holeCode??"Sin sondeo"}</option>)}</select></label>:<p>No hay reportes operacionales en este filtro para adjuntar archivos.</p>}{key&&<ReportAttachments key={key} reportKey={key}/>}</>;
}
