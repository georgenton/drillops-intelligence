CREATE TABLE IF NOT EXISTS operational_sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 tenant_id uuid NOT NULL REFERENCES tenants(id), expires_at timestamptz NOT NULL,
 revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS operational_login_attempts (
 identity_hash text PRIMARY KEY, attempts integer NOT NULL DEFAULT 0, window_start timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS operational_imports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 source_hash text NOT NULL, adapter_version text NOT NULL, actor_id uuid NOT NULL REFERENCES users(id),
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,source_hash,adapter_version)
);
CREATE TABLE IF NOT EXISTS operational_shifts (
 tenant_id uuid NOT NULL REFERENCES tenants(id), logical_key text NOT NULL,
 payload jsonb NOT NULL, revision integer NOT NULL DEFAULT 1,
 import_id uuid REFERENCES operational_imports(id), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,logical_key)
);
CREATE TABLE IF NOT EXISTS operational_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 logical_key text NOT NULL, previous_payload jsonb, next_payload jsonb NOT NULL,
 reason text NOT NULL, actor_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS operational_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 actor_id uuid NOT NULL REFERENCES users(id), payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE operational_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_imports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON operational_imports USING (tenant_id::text=current_setting('app.tenant_id',true)) WITH CHECK (tenant_id::text=current_setting('app.tenant_id',true));
ALTER TABLE operational_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_shifts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON operational_shifts USING (tenant_id::text=current_setting('app.tenant_id',true)) WITH CHECK (tenant_id::text=current_setting('app.tenant_id',true));
ALTER TABLE operational_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON operational_revisions USING (tenant_id::text=current_setting('app.tenant_id',true)) WITH CHECK (tenant_id::text=current_setting('app.tenant_id',true));
ALTER TABLE operational_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON operational_decisions USING (tenant_id::text=current_setting('app.tenant_id',true)) WITH CHECK (tenant_id::text=current_setting('app.tenant_id',true));
