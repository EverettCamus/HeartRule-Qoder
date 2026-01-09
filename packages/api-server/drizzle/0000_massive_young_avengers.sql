DO $$ BEGIN
 CREATE TYPE "execution_status" AS ENUM('running', 'waiting_input', 'paused', 'completed', 'error');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "message_role" AS ENUM('user', 'assistant', 'system');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "script_status" AS ENUM('draft', 'published', 'archived');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "script_type" AS ENUM('session', 'technique', 'awareness');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "session_status" AS ENUM('active', 'paused', 'completed', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "variable_scope" AS ENUM('global', 'session', 'phase', 'topic');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"content" text NOT NULL,
	"memory_type" varchar(50) NOT NULL,
	"importance" varchar(10) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"accessed_at" timestamp DEFAULT now() NOT NULL,
	"access_count" varchar(10) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"action_id" varchar(255),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"script_name" varchar(255) NOT NULL,
	"script_type" "script_type" NOT NULL,
	"script_content" text NOT NULL,
	"parsed_content" jsonb,
	"version" varchar(50) DEFAULT '1.0.0' NOT NULL,
	"status" "script_status" DEFAULT 'draft' NOT NULL,
	"author" varchar(255) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scripts_script_name_unique" UNIQUE("script_name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"script_id" uuid NOT NULL,
	"status" "session_status" DEFAULT 'active' NOT NULL,
	"execution_status" "execution_status" DEFAULT 'running' NOT NULL,
	"position" jsonb NOT NULL,
	"variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "variables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"variable_name" varchar(255) NOT NULL,
	"value" jsonb NOT NULL,
	"scope" "variable_scope" NOT NULL,
	"value_type" varchar(50) NOT NULL,
	"source" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_session_id_idx" ON "memories" ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_type_idx" ON "memories" ("memory_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_importance_idx" ON "memories" ("importance");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_session_id_idx" ON "messages" ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_timestamp_idx" ON "messages" ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scripts_type_status_idx" ON "scripts" ("script_type","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scripts_name_idx" ON "scripts" ("script_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_status_idx" ON "sessions" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_created_at_idx" ON "sessions" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "variables_session_id_idx" ON "variables" ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "variables_name_idx" ON "variables" ("variable_name");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memories" ADD CONSTRAINT "memories_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "variables" ADD CONSTRAINT "variables_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
