DROP VIEW "public"."redirect_lookup";--> statement-breakpoint
ALTER TABLE "codes" ADD COLUMN "rules" jsonb;--> statement-breakpoint
ALTER TABLE "codes" ADD COLUMN "advanced_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_events" ADD COLUMN "rule" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "current_period_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "trial_end" timestamp with time zone;--> statement-breakpoint
CREATE VIEW "public"."redirect_lookup" AS (select "id", "user_id", "domain", "slug", "destination", "status", "version", case when "advanced_paused" then null else "rules" end as "rules" from "codes" where "codes"."kind" = 'dynamic' and "codes"."deleted_at" is null);--> statement-breakpoint
-- The view was recreated: grant the redirect Worker's read-only role access again (as in 0001).
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'redirect_reader') THEN
    GRANT SELECT ON redirect_lookup TO redirect_reader;
  END IF;
END
$$;
