CREATE TABLE operational_report_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 logical_key text NOT NULL, previous_payload jsonb, next_payload jsonb NOT NULL,
 adapter_version text NOT NULL, actor_id uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE operational_report_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_report_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON operational_report_revisions
 USING (tenant_id::text=current_setting('app.tenant_id',true))
 WITH CHECK (tenant_id::text=current_setting('app.tenant_id',true));
