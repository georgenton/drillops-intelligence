"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Gauge, Layers3, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email,setEmail] = useState("platform@demo.local");
  const [password,setPassword] = useState("DrillOps2026!");
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(false);
  async function login(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError("");
    const res = await fetch("/api/auth/demo",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})});
    if (!res.ok) { setError("Credenciales inválidas. Usa un usuario demo."); setLoading(false); return; }
    router.push("/dashboard"); router.refresh();
  }
  return <main className="login-page">
    <section className="login-hero">
      <div className="login-brand"><span className="brand-mark"><Gauge size={22}/></span><span>DRILLOPS <b>INTELLIGENCE</b></span></div>
      <div className="hero-copy">
        <div className="eyebrow"><span/> INTELIGENCIA OPERACIONAL</div>
        <h1>Cada metro cuenta.<br/><em>Cada decisión también.</em></h1>
        <p>Convierte datos de perforación en decisiones más rápidas, menor costo por metro y mayor vida útil de corona.</p>
        <div className="hero-features">
          <span><Layers3/>Análisis por intervalo de 3 m</span><span><ShieldCheck/>Datos aislados por empresa</span><span><CheckCircle2/>Recomendaciones explicables</span>
        </div>
      </div>
      <div className="login-depth-lines"><i/><i/><i/><i/><i/><i/></div>
      <p className="hero-foot">Plataforma SaaS para perforación diamantina</p>
    </section>
    <section className="login-panel">
      <form className="login-card" onSubmit={login}>
        <div className="demo-pill"><span/> MODO DEMOSTRACIÓN</div>
        <h2>Bienvenido</h2><p>Ingresa a la operación demo de Extract Services.</p>
        <label>Correo electrónico<input aria-label="Correo electrónico" value={email} onChange={e=>setEmail(e.target.value)} type="email"/></label>
        <label>Contraseña<input aria-label="Contraseña" value={password} onChange={e=>setPassword(e.target.value)} type="password"/></label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-btn login-btn" disabled={loading}>{loading?"Ingresando…":"Ingresar al demo"}<ArrowRight size={18}/></button>
        <div className="demo-users"><b>Accesos rápidos</b>
          <button type="button" onClick={()=>setEmail("platform@demo.local")}>Admin plataforma</button>
          <button type="button" onClick={()=>setEmail("supervisor@extract.demo")}>Supervisor</button>
          <button type="button" onClick={()=>setEmail("operator@extract.demo")}>Operador</button>
        </div>
        <small>Contraseña demo: <code>DrillOps2026!</code></small>
      </form>
    </section>
  </main>
}
