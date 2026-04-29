import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const userGroupConfigs = pgTable(
  "user_group_configs",
  {
    id: serial("id").primaryKey(),
    groupName: varchar("group_name", { length: 200 }).notNull().unique(),
    kind: varchar("kind", { length: 32 }).notNull().default("standard"),
    temporaryKeysEnabled: boolean("temporary_keys_enabled").notNull().default(false),
    portalManaged: boolean("portal_managed").notNull().default(false),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userGroupConfigsKindIdx: index("idx_user_group_configs_kind").on(table.kind),
    userGroupConfigsTemporaryIdx: index("idx_user_group_configs_temporary").on(
      table.temporaryKeysEnabled
    ),
    userGroupConfigsPortalIdx: index("idx_user_group_configs_portal").on(table.portalManaged),
  })
);

export const portalPlans = pgTable(
  "portal_plans",
  {
    id: serial("id").primaryKey(),
    planId: varchar("plan_id", { length: 100 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    priceAmount: numeric("price_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    currency: varchar("currency", { length: 20 }).notNull().default("rmb"),
    validDays: integer("valid_days").notNull().default(30),
    providerGroup: varchar("provider_group", { length: 200 }).notNull().default("portal"),
    weeklyLimitUsd: numeric("weekly_limit_usd", { precision: 10, scale: 2 }).notNull().default("0"),
    monthlyLimitUsd: numeric("monthly_limit_usd", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    totalLimitUsd: numeric("total_limit_usd", { precision: 10, scale: 2 }).notNull().default("0"),
    rpmLimit: integer("rpm_limit").notNull().default(30),
    enabled: boolean("enabled").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    features: jsonb("features").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    portalPlansPlanIdIdx: uniqueIndex("uniq_portal_plans_plan_id").on(table.planId),
    portalPlansEnabledSortIdx: index("idx_portal_plans_enabled_sort").on(
      table.enabled,
      table.sortOrder
    ),
    portalPlansDeletedAtIdx: index("idx_portal_plans_deleted_at").on(table.deletedAt),
  })
);

export const portalUserLinks = pgTable(
  "portal_user_links",
  {
    id: serial("id").primaryKey(),
    portalUserId: varchar("portal_user_id", { length: 200 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    cchUserId: integer("cch_user_id").notNull(),
    defaultKeyId: integer("default_key_id").notNull(),
    lastProvisionedAt: timestamp("last_provisioned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    portalUserLinksPortalUserIdIdx: uniqueIndex("uniq_portal_user_links_portal_user_id").on(
      table.portalUserId
    ),
    portalUserLinksEmailIdx: index("idx_portal_user_links_email").on(table.email),
    portalUserLinksCchUserIdx: index("idx_portal_user_links_cch_user").on(table.cchUserId),
  })
);

export const portalSubscriptions = pgTable(
  "portal_subscriptions",
  {
    id: serial("id").primaryKey(),
    sourceOrderId: varchar("source_order_id", { length: 200 }).notNull(),
    portalUserId: varchar("portal_user_id", { length: 200 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    planId: varchar("plan_id", { length: 100 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    assignedSource: varchar("assigned_source", { length: 100 }).notNull().default("portal"),
    providerGroup: varchar("provider_group", { length: 200 }).notNull().default("portal"),
    weeklyLimitUsd: numeric("weekly_limit_usd", { precision: 10, scale: 2 }).notNull().default("0"),
    monthlyLimitUsd: numeric("monthly_limit_usd", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    totalLimitUsd: numeric("total_limit_usd", { precision: 10, scale: 2 }).notNull().default("0"),
    rpmLimit: integer("rpm_limit").notNull().default(30),
    cchUserId: integer("cch_user_id").notNull(),
    defaultKeyId: integer("default_key_id").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    portalSubscriptionsOrderIdx: uniqueIndex("uniq_portal_subscriptions_source_order_id").on(
      table.sourceOrderId
    ),
    portalSubscriptionsPortalUserIdx: index("idx_portal_subscriptions_portal_user").on(
      table.portalUserId
    ),
    portalSubscriptionsStatusIdx: index("idx_portal_subscriptions_status").on(table.status),
    portalSubscriptionsCreatedAtIdx: index("idx_portal_subscriptions_created_at").on(
      table.createdAt
    ),
  })
);

export const temporaryKeyBatches = pgTable(
  "temporary_key_batches",
  {
    id: serial("id").primaryKey(),
    providerGroup: varchar("provider_group", { length: 200 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    sourceUserId: integer("source_user_id").notNull(),
    sourceKeyId: integer("source_key_id").notNull(),
    createdCount: integer("created_count").notNull().default(0),
    createdByUserId: integer("created_by_user_id"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    temporaryKeyBatchesGroupIdx: index("idx_temporary_key_batches_group").on(table.providerGroup),
    temporaryKeyBatchesSourceUserIdx: index("idx_temporary_key_batches_source_user").on(
      table.sourceUserId
    ),
    temporaryKeyBatchesDeletedAtIdx: index("idx_temporary_key_batches_deleted_at").on(
      table.deletedAt
    ),
  })
);

export const temporaryKeyBatchKeys = pgTable(
  "temporary_key_batch_keys",
  {
    id: serial("id").primaryKey(),
    batchId: integer("batch_id").notNull(),
    keyId: integer("key_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    temporaryKeyBatchKeysBatchIdx: index("idx_temporary_key_batch_keys_batch").on(table.batchId),
    temporaryKeyBatchKeysKeyIdx: index("idx_temporary_key_batch_keys_key").on(table.keyId),
    temporaryKeyBatchKeysUnique: uniqueIndex("uniq_temporary_key_batch_keys_batch_key").on(
      table.batchId,
      table.keyId
    ),
  })
);
