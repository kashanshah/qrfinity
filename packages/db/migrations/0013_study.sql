CREATE TABLE "study_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" text NOT NULL,
	"photo_name" text,
	"category" text DEFAULT 'other' NOT NULL,
	"city" text,
	"country" text,
	"taken_on" date,
	"notes" text,
	"content_type" text NOT NULL,
	"url" text,
	"service" text,
	"short_link" boolean DEFAULT false NOT NULL,
	"outcome" text,
	"reason" text,
	"final_url" text,
	"http_status" integer,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_checked_at" timestamp with time zone,
	"times_seen" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_id" uuid NOT NULL,
	"file_key" text NOT NULL,
	"photo_name" text,
	"bytes" integer NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_photos" ADD CONSTRAINT "study_photos_code_id_study_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."study_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "study_codes_fingerprint_idx" ON "study_codes" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "study_codes_recheck_idx" ON "study_codes" USING btree ("last_checked_at");--> statement-breakpoint
CREATE INDEX "study_photos_code_idx" ON "study_photos" USING btree ("code_id");