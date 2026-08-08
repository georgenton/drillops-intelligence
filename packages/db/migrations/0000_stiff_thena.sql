CREATE TYPE "public"."billing_cycle" AS ENUM('monthly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('platform_admin', 'tenant_owner', 'admin', 'supervisor', 'operator', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."measurement_source" AS ENUM('manual', 'imported', 'sensor');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bit_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"manufacturer" text NOT NULL,
	"brand" text,
	"product_name" text NOT NULL,
	"matrix_code" text NOT NULL,
	"diameter" text NOT NULL,
	"purchase_price" numeric,
	"currency" text DEFAULT 'USD',
	"active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bit_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"drillhole_id" uuid NOT NULL,
	"rig_id" uuid NOT NULL,
	"bit_product_id" uuid NOT NULL,
	"entry_depth" numeric NOT NULL,
	"exit_depth" numeric,
	"drilling_hours" numeric,
	"purchase_cost" numeric,
	"wear_level" integer,
	"removal_reason" text,
	"legacy_cost_metric" numeric,
	"legacy_formula" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drillholes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"rig_id" uuid,
	"code" text NOT NULL,
	"target_depth" numeric(10, 2),
	"current_depth" numeric(10, 2) DEFAULT '0',
	"diameter" text NOT NULL,
	"status" text NOT NULL,
	"start_date" date,
	"estimated_finish_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" text NOT NULL,
	"file_name" text NOT NULL,
	"type" text NOT NULL,
	"rows_total" integer DEFAULT 0,
	"rows_imported" integer DEFAULT 0,
	"rows_skipped" integer DEFAULT 0,
	"errors" jsonb DEFAULT '[]'::jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drilling_intervals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"drillhole_id" uuid NOT NULL,
	"rig_id" uuid NOT NULL,
	"bit_run_id" uuid,
	"start_depth" numeric(10, 2) NOT NULL,
	"end_depth" numeric(10, 2) NOT NULL,
	"drilling_minutes" numeric NOT NULL,
	"pressure_value" numeric,
	"torque_value" numeric,
	"rpm" numeric,
	"water_flow" numeric,
	"water_return" text,
	"core_recovery_pct" numeric,
	"operational_hardness" integer,
	"fracturing" text,
	"abrasivity" text,
	"vibration" text,
	"stability" text,
	"comment" text,
	"source" "measurement_source" DEFAULT 'manual',
	"measured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid,
	"bit_product_id" uuid NOT NULL,
	"quantity_on_hand" integer DEFAULT 0,
	"reserved_quantity" integer DEFAULT 0,
	"reorder_level" integer DEFAULT 0,
	"unit_cost" numeric,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"monthly_price" numeric,
	"annual_price" numeric,
	"limits" jsonb NOT NULL,
	"active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"drillhole_id" uuid NOT NULL,
	"input" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"selected_bit_id" uuid,
	"decision" text,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rigs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"site_id" uuid,
	"manufacturer" text NOT NULL,
	"model" text NOT NULL,
	"serial" text NOT NULL,
	"code" text NOT NULL,
	"hourly_operational_cost" numeric(12, 2),
	"measurement_capabilities" jsonb DEFAULT '{}'::jsonb,
	"active" boolean DEFAULT true,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"drillhole_id" uuid NOT NULL,
	"rig_id" uuid NOT NULL,
	"date" date NOT NULL,
	"shift_type" text NOT NULL,
	"crew" text,
	"depth_start" numeric,
	"depth_end" numeric,
	"effective_drilling_hours" numeric,
	"total_shift_hours" numeric DEFAULT '12',
	"time_breakdown" jsonb DEFAULT '{}'::jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"billing_cycle" "billing_cycle" NOT NULL,
	"status" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"renews_at" timestamp with time zone,
	"trial_end" timestamp with time zone,
	"provider" text DEFAULT 'demo',
	"external_subscription_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"drillhole_id" uuid NOT NULL,
	"measured_depth" numeric NOT NULL,
	"inclination" numeric NOT NULL,
	"azimuth" numeric NOT NULL,
	"source" "measurement_source" DEFAULT 'imported',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"platform_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bit_products" ADD CONSTRAINT "bit_products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bit_runs" ADD CONSTRAINT "bit_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bit_runs" ADD CONSTRAINT "bit_runs_drillhole_id_drillholes_id_fk" FOREIGN KEY ("drillhole_id") REFERENCES "public"."drillholes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bit_runs" ADD CONSTRAINT "bit_runs_rig_id_rigs_id_fk" FOREIGN KEY ("rig_id") REFERENCES "public"."rigs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bit_runs" ADD CONSTRAINT "bit_runs_bit_product_id_bit_products_id_fk" FOREIGN KEY ("bit_product_id") REFERENCES "public"."bit_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drillholes" ADD CONSTRAINT "drillholes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drillholes" ADD CONSTRAINT "drillholes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drillholes" ADD CONSTRAINT "drillholes_rig_id_rigs_id_fk" FOREIGN KEY ("rig_id") REFERENCES "public"."rigs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drilling_intervals" ADD CONSTRAINT "drilling_intervals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drilling_intervals" ADD CONSTRAINT "drilling_intervals_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drilling_intervals" ADD CONSTRAINT "drilling_intervals_drillhole_id_drillholes_id_fk" FOREIGN KEY ("drillhole_id") REFERENCES "public"."drillholes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drilling_intervals" ADD CONSTRAINT "drilling_intervals_rig_id_rigs_id_fk" FOREIGN KEY ("rig_id") REFERENCES "public"."rigs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drilling_intervals" ADD CONSTRAINT "drilling_intervals_bit_run_id_bit_runs_id_fk" FOREIGN KEY ("bit_run_id") REFERENCES "public"."bit_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_bit_product_id_bit_products_id_fk" FOREIGN KEY ("bit_product_id") REFERENCES "public"."bit_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_drillhole_id_drillholes_id_fk" FOREIGN KEY ("drillhole_id") REFERENCES "public"."drillholes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_selected_bit_id_bit_products_id_fk" FOREIGN KEY ("selected_bit_id") REFERENCES "public"."bit_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rigs" ADD CONSTRAINT "rigs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rigs" ADD CONSTRAINT "rigs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_drillhole_id_drillholes_id_fk" FOREIGN KEY ("drillhole_id") REFERENCES "public"."drillholes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_rig_id_rigs_id_fk" FOREIGN KEY ("rig_id") REFERENCES "public"."rigs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_drillhole_id_drillholes_id_fk" FOREIGN KEY ("drillhole_id") REFERENCES "public"."drillholes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_tenant_idx" ON "audit_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "bit_product_tenant_idx" ON "bit_products" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "bit_run_tenant_idx" ON "bit_runs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "bit_run_drillhole_idx" ON "bit_runs" USING btree ("drillhole_id");--> statement-breakpoint
CREATE INDEX "drillhole_tenant_idx" ON "drillholes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "drillhole_project_idx" ON "drillholes" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "drillhole_rig_idx" ON "drillholes" USING btree ("rig_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flag_tenant_key_idx" ON "feature_flags" USING btree ("tenant_id","key");--> statement-breakpoint
CREATE INDEX "import_tenant_idx" ON "import_jobs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "interval_tenant_depth_idx" ON "drilling_intervals" USING btree ("tenant_id","start_depth","end_depth");--> statement-breakpoint
CREATE INDEX "interval_drillhole_idx" ON "drilling_intervals" USING btree ("drillhole_id");--> statement-breakpoint
CREATE INDEX "interval_rig_idx" ON "drilling_intervals" USING btree ("rig_id");--> statement-breakpoint
CREATE INDEX "interval_bit_run_idx" ON "drilling_intervals" USING btree ("bit_run_id");--> statement-breakpoint
CREATE INDEX "inventory_tenant_idx" ON "inventory" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "membership_tenant_idx" ON "memberships" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_unique_idx" ON "memberships" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "project_tenant_idx" ON "projects" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "recommendation_tenant_idx" ON "recommendations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "rig_tenant_idx" ON "rigs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "rig_site_idx" ON "rigs" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "shift_tenant_date_idx" ON "shifts" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE INDEX "shift_drillhole_idx" ON "shifts" USING btree ("drillhole_id");--> statement-breakpoint
CREATE INDEX "site_tenant_idx" ON "sites" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "subscription_tenant_idx" ON "subscriptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "survey_drillhole_depth_idx" ON "surveys" USING btree ("drillhole_id","measured_depth");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_slug_idx" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_idx" ON "users" USING btree ("email");