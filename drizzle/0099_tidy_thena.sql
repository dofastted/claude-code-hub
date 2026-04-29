CREATE TABLE IF NOT EXISTS "portal_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" varchar(100) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"price_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(20) DEFAULT 'rmb' NOT NULL,
	"valid_days" integer DEFAULT 30 NOT NULL,
	"provider_group" varchar(200) DEFAULT 'portal' NOT NULL,
	"weekly_limit_usd" numeric(10, 2) DEFAULT '0' NOT NULL,
	"monthly_limit_usd" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_limit_usd" numeric(10, 2) DEFAULT '0' NOT NULL,
	"rpm_limit" integer DEFAULT 30 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_order_id" varchar(200) NOT NULL,
	"portal_user_id" varchar(200) NOT NULL,
	"email" varchar(320) NOT NULL,
	"plan_id" varchar(100) NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"assigned_source" varchar(100) DEFAULT 'portal' NOT NULL,
	"provider_group" varchar(200) DEFAULT 'portal' NOT NULL,
	"weekly_limit_usd" numeric(10, 2) DEFAULT '0' NOT NULL,
	"monthly_limit_usd" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_limit_usd" numeric(10, 2) DEFAULT '0' NOT NULL,
	"rpm_limit" integer DEFAULT 30 NOT NULL,
	"cch_user_id" integer NOT NULL,
	"default_key_id" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portal_user_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"portal_user_id" varchar(200) NOT NULL,
	"email" varchar(320) NOT NULL,
	"cch_user_id" integer NOT NULL,
	"default_key_id" integer NOT NULL,
	"last_provisioned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "temporary_key_batch_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"key_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "temporary_key_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_group" varchar(200) NOT NULL,
	"name" varchar(200) NOT NULL,
	"source_user_id" integer NOT NULL,
	"source_key_id" integer NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" integer,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_group_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_name" varchar(200) NOT NULL,
	"kind" varchar(32) DEFAULT 'standard' NOT NULL,
	"temporary_keys_enabled" boolean DEFAULT false NOT NULL,
	"portal_managed" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_group_configs_group_name_unique" UNIQUE("group_name")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_portal_plans_plan_id" ON "portal_plans" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_plans_enabled_sort" ON "portal_plans" USING btree ("enabled","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_plans_deleted_at" ON "portal_plans" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_portal_subscriptions_source_order_id" ON "portal_subscriptions" USING btree ("source_order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_subscriptions_portal_user" ON "portal_subscriptions" USING btree ("portal_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_subscriptions_status" ON "portal_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_subscriptions_created_at" ON "portal_subscriptions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_portal_user_links_portal_user_id" ON "portal_user_links" USING btree ("portal_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_user_links_email" ON "portal_user_links" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_user_links_cch_user" ON "portal_user_links" USING btree ("cch_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_temporary_key_batch_keys_batch" ON "temporary_key_batch_keys" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_temporary_key_batch_keys_key" ON "temporary_key_batch_keys" USING btree ("key_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_temporary_key_batch_keys_batch_key" ON "temporary_key_batch_keys" USING btree ("batch_id","key_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_temporary_key_batches_group" ON "temporary_key_batches" USING btree ("provider_group");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_temporary_key_batches_source_user" ON "temporary_key_batches" USING btree ("source_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_temporary_key_batches_deleted_at" ON "temporary_key_batches" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_group_configs_kind" ON "user_group_configs" USING btree ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_group_configs_temporary" ON "user_group_configs" USING btree ("temporary_keys_enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_group_configs_portal" ON "user_group_configs" USING btree ("portal_managed");
--> statement-breakpoint
INSERT INTO "provider_groups" ("name", "description")
VALUES
	('test-key', '测试 key 分组'),
	('portal', '门户网站客户分组')
ON CONFLICT ("name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "user_group_configs" (
	"group_name",
	"kind",
	"temporary_keys_enabled",
	"portal_managed",
	"description"
)
VALUES
	('test-key', 'test_key', true, false, '测试 key 分组'),
	('portal', 'portal', true, true, '门户网站客户分组')
ON CONFLICT ("group_name") DO UPDATE SET
	"kind" = EXCLUDED."kind",
	"temporary_keys_enabled" = EXCLUDED."temporary_keys_enabled",
	"portal_managed" = EXCLUDED."portal_managed",
	"description" = EXCLUDED."description",
	"updated_at" = now();
