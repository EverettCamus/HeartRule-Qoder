ALTER TABLE "sessions" ADD COLUMN "version_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "version_snapshot" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_version_id_idx" ON "sessions" ("version_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_version_id_project_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "project_versions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
