"use client";

import { useState } from "react";
import type { PrivateSession } from "@/lib/private-auth";
import type { StoredShift } from "@/lib/operational-store";
import { RecordModal } from "./record-modal";

/** Uses the existing optimistic revision API; a conflict never retries a write. */
export function ShiftCorrection({ shift, session, onSaved }: {
  shift: StoredShift;
  session: PrivateSession;
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [revision, setRevision] = useState(shift.revision);
  const [advance, setAdvance] = useState("");
  const [hours, setHours] = useState("");
  const [reason, setReason] = useState("");
  const allowed = !session.demo && ["general_manager", "operations_supervisor", "platform_admin"].includes(session.role);
  if (!allowed) return null;
  return <>
    <button onClick={() => {
      setRevision(shift.revision);
      setAdvance(shift.advanceM === null ? "" : String(shift.advanceM));
      setHours(shift.drillingHours === null ? "" : String(shift.drillingHours));
      setReason(""); setError(""); setConflict(false); setOpen(true);
    }}>Corregir</button>
    <RecordModal open={open} title="Corregir turno"
      description={`${shift.date} · ${shift.rigCode} · ${shift.shiftType === "day" ? "Día" : "Noche"} · revisión ${revision}`}
      submitLabel={conflict ? "Recargar versión vigente" : "Guardar corrección auditada"}
      submitting={busy} error={error} onClose={() => setOpen(false)}
      onSubmit={async event => {
        event.preventDefault();
        setBusy(true); setError("");
        try {
          if (conflict) {
            await onSaved();
            setOpen(false);
            return;
          }
          const response = await fetch("/api/v2/operation", {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ logicalKey: shift.logicalKey, revision, advanceM: Number(advance), drillingHours: Number(hours), reason }),
          });
          const result = await response.json();
          if (!response.ok) {
            if (response.status === 409) setConflict(true);
            throw Error(result.error ?? "No se pudo guardar la corrección.");
          }
          await onSaved();
          setOpen(false);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "No se pudo completar la operación.");
        } finally { setBusy(false); }
      }}>
      <div className="record-grid">
        <label>Avance corregido (m)<input type="number" min="0" max="1000" step="any" required value={advance} disabled={busy || conflict} onChange={e => setAdvance(e.target.value)}/></label>
        <label>Horas de perforación corregidas (h)<input type="number" min="0" max="12" step="any" required value={hours} disabled={busy || conflict} onChange={e => setHours(e.target.value)}/></label>
        <label>Motivo de la corrección<textarea minLength={5} maxLength={500} required value={reason} disabled={busy || conflict} onChange={e => setReason(e.target.value)}/></label>
      </div>
      <p>Se conservan las profundidades y el detalle declarado de actividades. Esta corrección independiente queda registrada con autor, motivo y valores anteriores; no reescribe el Excel.</p>
      {conflict && <p role="status">Otro usuario guardó una revisión más reciente. Recarga y vuelve a abrir el turno para comparar los valores antes de corregir. No se enviará de nuevo esta modificación.</p>}
    </RecordModal>
  </>;
}
