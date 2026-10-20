"use client";

import { useId, useState, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";

/** Click/touch/keyboard disclosure rather than hover-only explanatory text. */
export function FormulaInfo({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return <div className="formula-info">
    <button type="button" aria-label={`Información: ${title}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <HelpCircle size={16}/> {title}
    </button>
    {open && <div id={id} role="region" aria-label={title} style={{ padding: 12 }}>{children}</div>}
  </div>;
}
