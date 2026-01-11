DO $$ BEGIN
 CREATE TYPE "file_type" AS ENUM('global', 'roles', 'skills', 'forms', 'rules', 'session');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "project_status" AS ENUM('draft', 'published', 'archived');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "validation_status" AS ENUM('valid', 'invalid', 'unknown');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_drafts" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"draft_files" jsonb NOT NULL,
	"validation_status" "validation_status" DEFAULT 'unknown' NOT NULL,
	"validation_errors" jsonb DEFAULT '[]'::jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version_number" varchar(32) NOT NULL,
	"version_files" jsonb NOT NULL,
	"release_note" text DEFAULT '' NOT NULL,
	"is_rollback" varchar(10) DEFAULT 'false' NOT NULL,
	"rollback_from_version_id" uuid,
	"published_at" timestamp DEFAULT now() NOT NULL,
	"published_by" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_name" varchar(255) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"engine_version" varchar(50) NOT NULL,
	"engine_version_min" varchar(50) NOT NULL,
	"current_version_id" uuid,
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"author" varchar(255) NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "script_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"file_type" "file_type" NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_content" jsonb NOT NULL,
	"yaml_content" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_versions_project_id_idx" ON "project_versions" ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_versions_published_at_idx" ON "project_versions" ("published_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_status_idx" ON "projects" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_author_idx" ON "projects" ("author");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_name_idx" ON "projects" ("project_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "script_files_project_id_idx" ON "script_files" ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "script_files_file_type_idx" ON "script_files" ("file_type");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_drafts" ADD CONSTRAINT "project_drafts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "script_files" ADD CONSTRAINT "script_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
