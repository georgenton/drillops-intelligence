-- Supplemental detail: never summed again into operational_shifts.
CREATE TABLE operational_quick_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 logical_key text NOT NULL,
 request_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('interval','event','crown_change','consumption')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 shift_revision integer NOT NULL CHECK(shift_revision>0),
 reason text NOT NULL CHECK(length(reason)>=5),
 actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,request_id),
 FOREIGN KEY(tenant_id,logical_key) REFERENCES operational_shifts(tenant_id,logical_key)
);
CREATE INDEX operational_quick_records_shift ON operational_quick_records(tenant_id,logical_key);
ALTER TABLE operational_quick_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_quick_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON operational_quick_records
 USING(tenant_id::text=current_setting('app.tenant_id',true))
 WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true));
