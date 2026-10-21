"use client";
import {createContext,useContext,useEffect,useState,type ReactNode} from "react";
import type {ReviewScenario} from "@/packages/domain/review-scenario";
type State={scenario:ReviewScenario|null;enabled:boolean;loading:boolean;error:string;setEnabled:(value:boolean)=>void};
const Context=createContext<State>({scenario:null,enabled:false,loading:true,error:"",setEnabled:()=>{}});
export const useReviewScenario=()=>useContext(Context);
export function ReviewScenarioProvider({children}:{children:ReactNode}){
 const [scenario,setScenario]=useState<ReviewScenario|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [enabled,setEnabledState]=useState(true);
 useEffect(()=>{
  const controller=new AbortController();
  fetch("/api/v2/review-scenario",{cache:"no-store",signal:controller.signal}).then(async response=>{
   if(!response.ok)throw Error("No se pudo cargar el escenario de revisión.");
   return response.json();
  }).then(body=>{setEnabledState(window.sessionStorage.getItem("drillops-review-mode")!=="excel");setScenario(body.scenario);setLoading(false);}).catch(e=>{if(!controller.signal.aborted){setError(e.message);setLoading(false);}});
  return()=>controller.abort();
 },[]);
 function setEnabled(value:boolean){setEnabledState(value);window.sessionStorage.setItem("drillops-review-mode",value?"review":"excel");}
 return <Context.Provider value={{scenario,enabled:enabled&&scenario!==null,loading,error,setEnabled}}>{children}</Context.Provider>;
}
export function ReviewScenarioBanner(){
 const {scenario,enabled,error,setEnabled}=useReviewScenario();
 if(error)return <p role="alert" className="form-error">{error} Recarga para reintentar; no se han sustituido datos.</p>;
 if(!scenario)return null;
 return <div className="demo-banner review-scenario-banner">
  <div><b>{enabled?"Versión de revisión · reportes reales + supuestos para validar":"Sólo datos del Excel · sin complementos"}</b><span>Originales conservados · validación de Raúl pendiente</span></div>
  <a href="/api/v2/review-scenario/report" target="_blank" rel="noreferrer">Ver datos y supuestos</a>
  <button onClick={()=>setEnabled(!enabled)}>{enabled?"Sólo datos del Excel":"Ver escenario completo"}</button>
 </div>;
}
export function ReviewMark({simulated=false}:{simulated?:boolean}){
 const {enabled}=useReviewScenario();
 return enabled?<a className="status warning" href="/api/v2/review-scenario/report" target="_blank" rel="noreferrer" title="Ver valores, fuentes y preguntas para validar">{simulated?"Simulado":"Estimado"} ⓘ</a>:null;
}
