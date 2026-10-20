CREATE TABLE operational_reports (
 tenant_id uuid NOT NULL REFERENCES tenants(id), logical_key text NOT NULL,
 payload jsonb NOT NULL, adapter_version text NOT NULL,
 revision integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,logical_key)
);
ALTER TABLE operational_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON operational_reports
 USING (tenant_id::text=current_setting('app.tenant_id',true))
 WITH CHECK (tenant_id::text=current_setting('app.tenant_id',true));
