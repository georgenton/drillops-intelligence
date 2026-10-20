CREATE TABLE operational_inventory_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 request_id uuid NOT NULL,
 code text NOT NULL,
 unit text NOT NULL CHECK(unit IN ('units','kg','litres','metres')),
 kind text NOT NULL CHECK(kind IN ('opening','in','out','adjustment')),
 quantity numeric(16,3) NOT NULL,
 balance_after numeric(16,3) NOT NULL CHECK(balance_after>=0),
 reason text NOT NULL CHECK(length(reason)>=5),
 actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,request_id)
);
CREATE INDEX operational_inventory_code ON operational_inventory_movements(tenant_id,code,created_at);
CREATE UNIQUE INDEX operational_inventory_opening ON operational_inventory_movements(tenant_id,code) WHERE kind='opening';
CREATE TABLE operational_report_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 report_key text NOT NULL,
 name text NOT NULL,
 mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg','application/pdf')),
 size integer NOT NULL CHECK(size>0 AND size<=3145728),
 content bytea NOT NULL CHECK(octet_length(content)<=3145728),
 sha256 text NOT NULL,
 reason text NOT NULL CHECK(length(reason)>=5),
 actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX operational_attachment_report ON operational_report_attachments(tenant_id,report_key);
ALTER TABLE operational_inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_inventory_movements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON operational_inventory_movements
 USING(tenant_id::text=current_setting('app.tenant_id',true))
 WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true));
ALTER TABLE operational_report_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_report_attachments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON operational_report_attachments
 USING(tenant_id::text=current_setting('app.tenant_id',true))
 WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true));
