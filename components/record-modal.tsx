"use client";

import { useEffect, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

export function RecordModal({ open, title, description, submitLabel, submitting, error, onClose, onSubmit, children }: {
  open: boolean;
  title: string;
  description: string;
  submitLabel: string;
  submitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !submitting) onClose(); };
    document.addEventListener("keydown", close);
    document.body.classList.add("modal-open");
    return () => { document.removeEventListener("keydown", close); document.body.classList.remove("modal-open"); };
  }, [open, submitting, onClose]);
  if (!open) return null;
  return <div className="record-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose(); }}>
    <section className="record-modal" role="dialog" aria-modal="true" aria-labelledby="record-modal-title">
      <form onSubmit={onSubmit}>
        <header><div><span>NUEVO REGISTRO</span><h2 id="record-modal-title">{title}</h2><p>{description}</p></div><button type="button" aria-label="Cerrar" onClick={onClose} disabled={submitting}><X/></button></header>
        <div className="record-form">{children}{error&&<div className="record-error" role="alert"><AlertTriangle/>{error}</div>}</div>
        <footer><span><CheckCircle2/>Los datos quedan aislados por empresa.</span><button type="button" onClick={onClose} disabled={submitting}>Cancelar</button><button className="primary-btn" disabled={submitting}>{submitting?"Guardando…":submitLabel}</button></footer>
      </form>
    </section>
  </div>;
}

export function RecordNotice({ children }: { children: ReactNode }) {
  return <div className="record-notice" role="status"><CheckCircle2/>{children}</div>;
}
