"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ManualRecordKind } from "@/lib/manual-records";
import type { TenantId } from "@/packages/domain/types";

type Entity = { id: string; tenantId: TenantId };

export function useManualRecords<T extends Entity>(kind: ManualRecordKind, tenantId: TenantId, seed: T[]) {
  const activeKey = `${tenantId}:${kind}`;
  const [loaded, setLoaded] = useState<{ key: string; records: T[] }>({ key: activeKey, records: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const manual = loaded.key === activeKey ? loaded.records : [];

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/manual-records?tenantId=${encodeURIComponent(tenantId)}&kind=${kind}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "No se pudieron cargar los registros manuales");
        setLoaded({ key: activeKey, records: Array.isArray(body.records) ? body.records : [] });
      })
      .catch((reason) => { if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "No se pudieron cargar los registros manuales"); })
    return () => controller.abort();
  }, [activeKey, kind, tenantId]);

  const records = useMemo(() => {
    const manualIds = new Set(manual.map((record) => record.id));
    return [...manual, ...seed.filter((record) => !manualIds.has(record.id))];
  }, [manual, seed]);

  const create = useCallback(async (payload: Omit<T, "id" | "tenantId">): Promise<T> => {
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/v1/manual-records?tenantId=${encodeURIComponent(tenantId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenantId, kind, payload }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No se pudo guardar el registro");
      const record = body.record as T;
      setLoaded((current) => ({ key: activeKey, records: [record, ...(current.key === activeKey ? current.records : [])] }));
      return record;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "No se pudo guardar el registro";
      setError(message);
      throw new Error(message);
    } finally { setSaving(false); }
  }, [activeKey, kind, tenantId]);

  return { records, manual, saving, error, setError, create };
}
