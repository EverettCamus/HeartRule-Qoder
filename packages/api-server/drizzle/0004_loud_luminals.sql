CREATE TABLE IF NOT EXISTS "user_global_variables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"project_id" uuid NOT NULL,
	"variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_global_variables_user_project_unique_idx" ON "user_global_variables" ("user_id","project_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_global_variables" ADD CONSTRAINT "user_global_variables_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
