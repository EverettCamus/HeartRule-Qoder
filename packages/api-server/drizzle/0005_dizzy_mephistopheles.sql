CREATE TABLE IF NOT EXISTS "debug_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"run_id" varchar(50) NOT NULL,
	"phase_id" varchar(255) NOT NULL,
	"topic_id" varchar(255) NOT NULL,
	"action_id" varchar(255) NOT NULL,
	"action_type" varchar(50) NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "current_run_id" varchar(50);--> statement-breakpoint
ALTER TABLE "variables" ADD COLUMN "action_id" varchar(255);--> statement-breakpoint
ALTER TABLE "variables" ADD COLUMN "phase_id" varchar(255);--> statement-breakpoint
ALTER TABLE "variables" ADD COLUMN "topic_id" varchar(255);--> statement-breakpoint
ALTER TABLE "variables" ADD COLUMN "round" integer DEFAULT 1;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debug_entries_lookup_idx" ON "debug_entries" ("session_id","run_id","phase_id","topic_id","action_id","round");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "debug_entries" ADD CONSTRAINT "debug_entries_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
