"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Gauge, Layers3, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [demo,setDemo] = useState(false);
  const [closed,setClosed] = useState(false);
  useEffect(()=>{fetch("/api/auth/mode").then(r=>r.json()).then(m=>{setDemo(m.demo===true);setClosed(m.closed===true)}).catch(()=>setClosed(true))},[]);
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(false);
  async function login(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError("");
    const res = await fetch(demo?"/api/auth/demo":"/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})}).catch(()=>null);
    if(!res){setError("Servicio no disponible");setLoading(false);return;}
    const body=await res.json().catch(()=>({})) as {landing?:string};
    if (!res.ok) { setError(res.status===503?"Servicio no disponible":res.status===429?"Demasiados intentos; espera 15 minutos":"Acceso denegado. Verifica tus credenciales."); setLoading(false); return; }
    router.push(`/${body.landing??"dashboard"}`); router.refresh();
  }
  return <main className="login-page">
    <section className="login-hero">
      <div className="login-brand"><span className="brand-mark"><Gauge size={22}/></span><span>DRILLOPS <b>INTELLIGENCE</b></span></div>
      <div className="hero-copy">
        <div className="eyebrow"><span/> INTELIGENCIA OPERACIONAL</div>
        <h1>Cada metro cuenta.<br/><em>Cada decisión también.</em></h1>
        <p>Convierte registros de perforación en indicadores trazables y decisiones explicables con supervisión humana.</p>
        <div className="hero-features">
          <span><Layers3/>Análisis operacional por turno</span><span><ShieldCheck/>Datos aislados por empresa</span><span><CheckCircle2/>Recomendaciones explicables</span>
        </div>
      </div>
      <div className="login-depth-lines"><i/><i/><i/><i/><i/><i/></div>
      <p className="hero-foot">Plataforma SaaS para perforación diamantina</p>
    </section>
    <section className="login-panel">
      <form className="login-card" onSubmit={login}>
        <div className="demo-pill"><span/> {demo?"DEMOSTRACIÓN · SÓLO LECTURA":closed?"ACCESO COMERCIAL CERRADO":"ACCESO PRIVADO"}</div>
        <h2>Bienvenido</h2><p>{demo?"Recorrido con datos ilustrativos.":"Ingresa con tu cuenta individual."}</p>
        <label>Correo electrónico<input aria-label="Correo electrónico" value={email} onChange={e=>setEmail(e.target.value)} type="email"/></label>
        <label>Contraseña<input aria-label="Contraseña" value={password} onChange={e=>setPassword(e.target.value)} type="password"/></label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-btn login-btn" disabled={loading||closed}>{loading?"Ingresando…":"Ingresar"}<ArrowRight size={18}/></button>
        {demo&&<div className="demo-users"><b>Accesos rápidos (contraseña demostrativa abajo)</b>
          <button type="button" onClick={()=>setEmail("platform@demo.local")}>Admin plataforma</button>
          <button type="button" onClick={()=>setEmail("gerencia@extract.demo")}>Gerente General</button>
          <button type="button" onClick={()=>setEmail("cliente@extract.demo")}>Cliente</button>
          <button type="button" onClick={()=>setEmail("supervisor@extract.demo")}>Supervisor</button>
          <button type="button" onClick={()=>setEmail("perforador@extract.demo")}>Perforador</button>
          <button type="button" onClick={()=>setEmail("control@extract.demo")}>Control</button>
          <button type="button" onClick={()=>setEmail("basico@minera-a.demo")}>Plan Básico</button>
          <button type="button" onClick={()=>setEmail("intermedio@minera-b.demo")}>Plan Intermedio</button>
        </div>}
        {demo&&<small>Contraseña demo: <code>DrillOps2026!</code></small>}
      </form>
    </section>
  </main>
}
