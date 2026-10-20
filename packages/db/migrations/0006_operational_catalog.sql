CREATE TABLE operational_catalog (
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 kind text NOT NULL CHECK(kind IN ('rig','hole','crown')),
 code text NOT NULL CHECK(length(code) BETWEEN 1 AND 80 AND code=upper(btrim(code))),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND payload->>'code'=code),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,kind,code)
);
CREATE TABLE operational_catalog_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),kind text NOT NULL,code text NOT NULL,
 previous_payload jsonb,next_payload jsonb NOT NULL,
 revision integer NOT NULL,reason text NOT NULL,actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE operational_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_catalog FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON operational_catalog
 USING(tenant_id::text=current_setting('app.tenant_id',true))
 WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true));
ALTER TABLE operational_catalog_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_catalog_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON operational_catalog_revisions
 USING(tenant_id::text=current_setting('app.tenant_id',true))
 WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true));
