ALTER TYPE "file_type" ADD VALUE 'template';--> statement-breakpoint
ALTER TYPE "project_status" ADD VALUE 'deprecated';--> statement-breakpoint
ALTER TABLE "script_files" ADD COLUMN "file_path" varchar(512);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "script_files_file_path_idx" ON "script_files" ("file_path");