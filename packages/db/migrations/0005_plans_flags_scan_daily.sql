CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"user_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_daily" (
	"code_id" uuid NOT NULL,
	"day" date NOT NULL,
	"scans" integer NOT NULL,
	"uniques" integer NOT NULL,
	"hours" jsonb NOT NULL,
	"breakdowns" jsonb NOT NULL,
	CONSTRAINT "scan_daily_code_id_day_pk" PRIMARY KEY("code_id","day")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_daily" ADD CONSTRAINT "scan_daily_code_id_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scan_daily_day_idx" ON "scan_daily" USING btree ("day");