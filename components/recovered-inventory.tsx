"use client";
import { useCallback,useEffect,useState,type FormEvent } from "react";
import { PackageSearch, ClipboardList, AlertTriangle } from "lucide-react";
import type { InventorySnapshot } from "@/packages/domain/inventory-ledger";
import { useReviewScenario,ReviewMark } from "./review-scenario";
export function useInventory(enabled=true){
  const [snapshot,setSnapshot]=useState<InventorySnapshot|null>(null),[error,setError]=useState("");
  const refresh=useCallback(async()=>{const response=await fetch("/api/v2/inventory",{cache:"no-store"});const body=await response.json();if(!response.ok)throw Error(body.error);setSnapshot(body);setError("");},[]);
  useEffect(()=>{if(!enabled)return;const controller=new AbortController();fetch("/api/v2/inventory",{cache:"no-store",signal:controller.signal}).then(async response=>{const body=await response.json();if(!response.ok)throw Error(body.error);return body;}).then(setSnapshot).catch(error=>{if(!controller.signal.aborted)setError(error.message);});return()=>controller.abort();},[enabled]);
  return {snapshot:enabled?snapshot:null,error:enabled?error:"",refresh};
}
const unitLabels:Record<string,string>={units:"unidades",kg:"kg",litres:"litros",metres:"metros"};
export function RecoveredInventory(){
  const {snapshot,error,refresh}=useInventory();
  const review=useReviewScenario();
  const [message,setMessage]=useState(""),[busy,setBusy]=useState(false),[requestId,setRequestId]=useState("");
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const form=event.currentTarget,values=new FormData(form);setBusy(true);setMessage("");
    const id=requestId||crypto.randomUUID();setRequestId(id);
    try{const response=await fetch("/api/v2/inventory",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:id,code:values.get("code"),unit:values.get("unit"),kind:values.get("kind"),quantity:Number(values.get("quantity")),reason:values.get("reason")})});const body=await response.json();if(!response.ok)throw Error(body.error);
      await refresh();setRequestId("");form.reset();setMessage("Movimiento persistido. Saldo actualizado.");
    }catch(error){setMessage(error instanceof Error?error.message:"No se pudo guardar.");}finally{setBusy(false);}
  }
  return <>
    {review.enabled&&review.scenario&&<section className="panel"><header className="panel-head"><div><h3>Inventario de revisión <ReviewMark simulated/></h3><p>Referencias sintéticas del mismo escenario que Advisor. No son movimientos, compras ni reservas del inventario real.</p></div></header><div style={{overflowX:"auto"}}><table><thead><tr><th>Referencia de escenario</th><th>Stock de ejemplo</th><th>Reserva de ejemplo</th><th>Neto de ejemplo</th></tr></thead><tbody>{review.scenario.candidates.map(c=><tr key={c.id}><td>{c.id} · {c.product}</td><td>{c.stock??"—"} unidades</td><td>{c.reserved??"—"} unidades</td><td>{c.stock!==null&&c.reserved!==null?c.stock-c.reserved:"—"} unidades</td></tr>)}</tbody></table></div><details style={{padding:16}}><summary>Cómo se concilia el ejemplo</summary><p>Neto = stock de escenario − reservas de escenario. Los valores proceden del manifiesto compartido con Coronas y Advisor; no se crea ninguna transacción en el libro operacional.</p><a href="/api/v2/review-scenario/report" target="_blank" rel="noreferrer">Ver datos y supuestos exactos</a></details></section>}
    {review.enabled&&review.scenario?<div className="inventory-overview"><div><PackageSearch/><section><b>{review.scenario.candidates.length}</b><span>Referencias sintéticas de revisión</span></section></div><div><ClipboardList/><section><b>{review.scenario.candidates.reduce((sum,c)=>sum+(c.stock??0),0)}</b><span>Unidades de ejemplo · simulado</span></section></div><div className="warn"><AlertTriangle/><section><b>{review.scenario.candidates.reduce((sum,c)=>sum+(c.reserved??0),0)}</b><span>Reservas de ejemplo · simulado</span></section></div></div>:<div className="inventory-overview"><div><PackageSearch/><section><b>{snapshot?.balances.length??"—"}</b><span>Artículos con saldo confirmado</span></section></div><div><ClipboardList/><section><b>{snapshot?.movements.length??"—"}</b><span>Movimientos recientes · máximo 500</span></section></div><div className="warn"><AlertTriangle/><section><b>—</b><span>Reservas no declaradas</span></section></div></div>}
    <section className="panel"><header className="panel-head"><div><h3>Inventario disponible</h3><p>Saldos explícitos por artículo y unidad. Los consumos importados no se convierten automáticamente en stock.</p></div></header>
      {error&&<p role="alert">{error}</p>}
      {!snapshot?<p>Cargando inventario…</p>:!snapshot.balances.length?<p className="source-note">No hay saldos iniciales registrados. Esto significa stock desconocido, no cero.</p>:<div style={{overflowX:"auto"}}><table><thead><tr><th>Código</th><th>Saldo registrado</th><th>Unidad</th></tr></thead><tbody>{snapshot.balances.map(b=><tr key={b.code}><td>{b.code}</td><td>{b.balance}</td><td>{unitLabels[b.unit]}</td></tr>)}</tbody></table></div>}
    </section>
    {snapshot?.canWrite?<section className="panel supplementary-panel" style={{padding:20}}><h3>Registrar movimiento</h3><form className="record-grid" onSubmit={save} onChange={()=>setRequestId("")} style={{display:"grid",gap:12,gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))"}}>
      <label>Código del artículo<input name="code" required maxLength={80} placeholder="Código exacto de corona o insumo"/></label>
      <label>Unidad<select name="unit">{Object.entries(unitLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label>Movimiento<select name="kind"><option value="opening">Saldo inicial explícito</option><option value="in">Entrada</option><option value="out">Salida</option><option value="adjustment">Ajuste: delta +/−</option></select></label>
      <label>Cantidad<input name="quantity" type="number" step="0.001" required/></label><label>Motivo auditable<input name="reason" minLength={5} maxLength={500} required/></label>
      <button className="primary-btn" disabled={busy}>{busy?"Guardando…":"Guardar movimiento"}</button>
    </form><p>La apertura sólo puede registrarse una vez por código. El ajuste suma o resta la cantidad indicada; no reemplaza el saldo. No se permiten saldos negativos.</p></section>:<p className="source-note">Consulta de inventario. Este perfil no modifica saldos.</p>}
    {message&&<p role="status">{message}</p>}
    <section className="panel"><header className="panel-head"><div><h3>Historial de movimientos</h3><p>Últimos 500 movimientos. El saldo incluye todos los registros; cada movimiento conserva actor, fecha y motivo en auditoría.</p></div></header><div style={{overflowX:"auto"}}><table><thead><tr><th>Fecha</th><th>Código</th><th>Tipo</th><th>Cantidad</th><th>Saldo posterior</th><th>Motivo</th></tr></thead><tbody>{snapshot?.movements.map(m=><tr key={m.id}><td>{new Date(m.createdAt).toLocaleString("es-EC")}</td><td>{m.code}</td><td>{m.kind}</td><td>{m.quantity} {unitLabels[m.unit]}</td><td>{m.balanceAfter}</td><td>{m.reason}</td></tr>)}</tbody></table></div></section>
  </>;
}
