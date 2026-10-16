CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_id" uuid,
	"reported" text NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"reporter_email" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "codes" ADD COLUMN "risk_status" text DEFAULT 'unchecked' NOT NULL;--> statement-breakpoint
ALTER TABLE "codes" ADD COLUMN "risk_detail" text;--> statement-breakpoint
ALTER TABLE "codes" ADD COLUMN "risk_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "codes" ADD COLUMN "risk_checks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "codes" ADD COLUMN "next_risk_check_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_code_id_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "blocklist_kind_value_idx" ON "blocklist" USING btree ("kind","value");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_code_idx" ON "reports" USING btree ("code_id");--> statement-breakpoint
CREATE INDEX "codes_risk_due_idx" ON "codes" USING btree ("next_risk_check_at");