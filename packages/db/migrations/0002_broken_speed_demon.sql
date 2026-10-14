ALTER TYPE "public"."role" ADD VALUE IF NOT EXISTS 'general_manager' BEFORE 'tenant_owner';--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE IF NOT EXISTS 'client' BEFORE 'tenant_owner';--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE IF NOT EXISTS 'operations_supervisor' BEFORE 'tenant_owner';--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE IF NOT EXISTS 'driller' BEFORE 'tenant_owner';--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE IF NOT EXISTS 'control' BEFORE 'tenant_owner';--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "minimum_commitment_months" integer DEFAULT 1 NOT NULL;
