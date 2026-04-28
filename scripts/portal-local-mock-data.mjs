#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const envPath = resolve(repoRoot, ".env.local");

if (existsSync(envPath)) {
  dotenv.config({ path: envPath, quiet: true });
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

const PORTAL_GROUP = "portal";
const TEST_KEY_GROUP = "test-key";
const MOCK_PORTAL_USER_ID = "mock-user-001";
const MOCK_SOURCE_ORDER_ID = "mock-order-001";
const MOCK_EMAIL = "mock-user-001@example.test";

const PLANS = [
  {
    planId: "pro",
    name: "Pro",
    description: "Local CCH portal integration plan",
    priceAmount: "99",
    currency: "rmb",
    validDays: 30,
    providerGroup: PORTAL_GROUP,
    weeklyLimitUsd: "200",
    monthlyLimitUsd: "800",
    totalLimitUsd: "800",
    rpmLimit: 30,
    enabled: true,
    sortOrder: 10,
    features: ["local-smoke", "portal"],
  },
  {
    planId: "trial",
    name: "Trial",
    description: "Local low-quota portal integration plan",
    priceAmount: "10",
    currency: "rmb",
    validDays: 7,
    providerGroup: PORTAL_GROUP,
    weeklyLimitUsd: "50",
    monthlyLimitUsd: "75",
    totalLimitUsd: "75",
    rpmLimit: 20,
    enabled: true,
    sortOrder: 20,
    features: ["local-smoke", "trial"],
  },
  {
    planId: "disabled-local",
    name: "Disabled Local",
    description: "Disabled plan for local negative-path tests",
    priceAmount: "1",
    currency: "rmb",
    validDays: 30,
    providerGroup: PORTAL_GROUP,
    weeklyLimitUsd: "1",
    monthlyLimitUsd: "1",
    totalLimitUsd: "1",
    rpmLimit: 1,
    enabled: false,
    sortOrder: 99,
    features: ["local-smoke", "disabled"],
  },
];

function fail(message) {
  console.error(`[portal:mock-data] ${message}`);
  process.exit(1);
}

function assertRuntimeAllowed() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PORTAL_MOCK_DATA !== "true") {
    fail("Refusing to run in NODE_ENV=production without ALLOW_PORTAL_MOCK_DATA=true.");
  }
}

function parseDsn(value) {
  try {
    return new URL(value);
  } catch (error) {
    fail(`DSN is not a valid URL: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertLocalDsn(dsn) {
  const url = parseDsn(dsn);
  const hostname = url.hostname.toLowerCase();
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(hostname)) {
    fail(`Refusing to write mock data to non-local DSN host "${hostname}".`);
  }
  return { hostname, database: url.pathname.replace(/^\//, "") || "(default)" };
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function publicPlan(plan) {
  return {
    planId: plan.planId,
    enabled: plan.enabled,
    validDays: plan.validDays,
    weeklyLimitUsd: Number(plan.weeklyLimitUsd),
    monthlyLimitUsd: Number(plan.monthlyLimitUsd),
    totalLimitUsd: Number(plan.totalLimitUsd),
    rpmLimit: plan.rpmLimit,
  };
}

async function upsertProviderGroups(tx) {
  await tx`
    INSERT INTO provider_groups (name, cost_multiplier, description)
    VALUES
      (${PORTAL_GROUP}, '1.0', 'Local portal integration group'),
      (${TEST_KEY_GROUP}, '1.0', 'Local test key group')
    ON CONFLICT (name) DO UPDATE SET
      description = EXCLUDED.description,
      updated_at = now()
  `;
}

async function upsertUserGroupConfigs(tx) {
  await tx`
    INSERT INTO user_group_configs (
      group_name,
      kind,
      temporary_keys_enabled,
      portal_managed,
      description
    )
    VALUES
      (${PORTAL_GROUP}, 'portal', true, true, 'Local portal managed users and keys'),
      (${TEST_KEY_GROUP}, 'test_key', true, false, 'Local test key group')
    ON CONFLICT (group_name) DO UPDATE SET
      kind = EXCLUDED.kind,
      temporary_keys_enabled = EXCLUDED.temporary_keys_enabled,
      portal_managed = EXCLUDED.portal_managed,
      description = EXCLUDED.description,
      updated_at = now()
  `;
}

async function upsertPlans(tx) {
  const rows = [];
  for (const plan of PLANS) {
    const [row] = await tx`
      INSERT INTO portal_plans (
        plan_id,
        name,
        description,
        price_amount,
        currency,
        valid_days,
        provider_group,
        weekly_limit_usd,
        monthly_limit_usd,
        total_limit_usd,
        rpm_limit,
        enabled,
        sort_order,
        features,
        deleted_at
      )
      VALUES (
        ${plan.planId},
        ${plan.name},
        ${plan.description},
        ${plan.priceAmount},
        ${plan.currency},
        ${plan.validDays},
        ${plan.providerGroup},
        ${plan.weeklyLimitUsd},
        ${plan.monthlyLimitUsd},
        ${plan.totalLimitUsd},
        ${plan.rpmLimit},
        ${plan.enabled},
        ${plan.sortOrder},
        ${tx.json(plan.features)},
        null
      )
      ON CONFLICT (plan_id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        price_amount = EXCLUDED.price_amount,
        currency = EXCLUDED.currency,
        valid_days = EXCLUDED.valid_days,
        provider_group = EXCLUDED.provider_group,
        weekly_limit_usd = EXCLUDED.weekly_limit_usd,
        monthly_limit_usd = EXCLUDED.monthly_limit_usd,
        total_limit_usd = EXCLUDED.total_limit_usd,
        rpm_limit = EXCLUDED.rpm_limit,
        enabled = EXCLUDED.enabled,
        sort_order = EXCLUDED.sort_order,
        features = EXCLUDED.features,
        deleted_at = null,
        updated_at = now()
      RETURNING id, plan_id, enabled
    `;
    rows.push(row);
  }
  return rows;
}

async function createOrUpdateMockUser(tx, plan, now) {
  const expiresAt = addDays(now, plan.validDays);
  const [existingLink] = await tx`
    SELECT cch_user_id, default_key_id
    FROM portal_user_links
    WHERE portal_user_id = ${MOCK_PORTAL_USER_ID}
    LIMIT 1
  `;

  let userId = existingLink?.cch_user_id ?? null;
  if (userId) {
    const [updated] = await tx`
      UPDATE users SET
        name = ${MOCK_EMAIL},
        description = ${`Portal user ${MOCK_PORTAL_USER_ID}`},
        rpm_limit = ${plan.rpmLimit},
        provider_group = ${plan.providerGroup},
        limit_weekly_usd = ${plan.weeklyLimitUsd},
        limit_monthly_usd = ${plan.monthlyLimitUsd},
        limit_total_usd = ${plan.totalLimitUsd},
        is_enabled = true,
        expires_at = ${expiresAt},
        updated_at = now()
      WHERE id = ${userId} AND deleted_at IS NULL
      RETURNING id
    `;
    userId = updated?.id ?? null;
  }

  if (!userId) {
    const [created] = await tx`
      INSERT INTO users (
        name,
        description,
        rpm_limit,
        provider_group,
        tags,
        limit_weekly_usd,
        limit_monthly_usd,
        limit_total_usd,
        is_enabled,
        expires_at
      )
      VALUES (
        ${MOCK_EMAIL},
        ${`Portal user ${MOCK_PORTAL_USER_ID}`},
        ${plan.rpmLimit},
        ${plan.providerGroup},
        ${tx.json(["local-mock", "portal"])},
        ${plan.weeklyLimitUsd},
        ${plan.monthlyLimitUsd},
        ${plan.totalLimitUsd},
        true,
        ${expiresAt}
      )
      RETURNING id
    `;
    userId = created.id;
  }

  let keyId = existingLink?.default_key_id ?? null;
  if (keyId) {
    const [updated] = await tx`
      UPDATE keys SET
        name = 'default',
        is_enabled = true,
        expires_at = ${expiresAt},
        can_login_web_ui = true,
        limit_weekly_usd = ${plan.weeklyLimitUsd},
        limit_monthly_usd = ${plan.monthlyLimitUsd},
        limit_total_usd = ${plan.totalLimitUsd},
        provider_group = ${plan.providerGroup},
        updated_at = now()
      WHERE id = ${keyId} AND user_id = ${userId} AND deleted_at IS NULL
      RETURNING id
    `;
    keyId = updated?.id ?? null;
  }

  if (!keyId) {
    const [existingDefaultKey] = await tx`
      SELECT id
      FROM keys
      WHERE user_id = ${userId}
        AND name = 'default'
        AND provider_group = ${plan.providerGroup}
        AND deleted_at IS NULL
      ORDER BY id ASC
      LIMIT 1
    `;
    keyId = existingDefaultKey?.id ?? null;
  }

  if (!keyId) {
    const [created] = await tx`
      INSERT INTO keys (
        user_id,
        key,
        name,
        is_enabled,
        expires_at,
        can_login_web_ui,
        limit_weekly_usd,
        limit_monthly_usd,
        limit_total_usd,
        provider_group
      )
      VALUES (
        ${userId},
        ${`sk-${randomBytes(16).toString("hex")}`},
        'default',
        true,
        ${expiresAt},
        true,
        ${plan.weeklyLimitUsd},
        ${plan.monthlyLimitUsd},
        ${plan.totalLimitUsd},
        ${plan.providerGroup}
      )
      RETURNING id
    `;
    keyId = created.id;
  } else {
    await tx`
      UPDATE keys SET
        is_enabled = true,
        expires_at = ${expiresAt},
        can_login_web_ui = true,
        limit_weekly_usd = ${plan.weeklyLimitUsd},
        limit_monthly_usd = ${plan.monthlyLimitUsd},
        limit_total_usd = ${plan.totalLimitUsd},
        provider_group = ${plan.providerGroup},
        updated_at = now()
      WHERE id = ${keyId}
    `;
  }

  const [link] = await tx`
    INSERT INTO portal_user_links (
      portal_user_id,
      email,
      cch_user_id,
      default_key_id,
      last_provisioned_at
    )
    VALUES (${MOCK_PORTAL_USER_ID}, ${MOCK_EMAIL}, ${userId}, ${keyId}, ${now})
    ON CONFLICT (portal_user_id) DO UPDATE SET
      email = EXCLUDED.email,
      cch_user_id = EXCLUDED.cch_user_id,
      default_key_id = EXCLUDED.default_key_id,
      last_provisioned_at = EXCLUDED.last_provisioned_at,
      updated_at = now()
    RETURNING id, portal_user_id, cch_user_id, default_key_id
  `;

  const [subscription] = await tx`
    INSERT INTO portal_subscriptions (
      source_order_id,
      portal_user_id,
      email,
      plan_id,
      status,
      starts_at,
      expires_at,
      assigned_source,
      provider_group,
      weekly_limit_usd,
      monthly_limit_usd,
      total_limit_usd,
      rpm_limit,
      cch_user_id,
      default_key_id,
      notes
    )
    VALUES (
      ${MOCK_SOURCE_ORDER_ID},
      ${MOCK_PORTAL_USER_ID},
      ${MOCK_EMAIL},
      ${plan.planId},
      'active',
      ${now},
      ${expiresAt},
      'portal-local-mock-data',
      ${plan.providerGroup},
      ${plan.weeklyLimitUsd},
      ${plan.monthlyLimitUsd},
      ${plan.totalLimitUsd},
      ${plan.rpmLimit},
      ${userId},
      ${keyId},
      'local mock subscription'
    )
    ON CONFLICT (source_order_id) DO UPDATE SET
      portal_user_id = EXCLUDED.portal_user_id,
      email = EXCLUDED.email,
      plan_id = EXCLUDED.plan_id,
      status = EXCLUDED.status,
      starts_at = EXCLUDED.starts_at,
      expires_at = EXCLUDED.expires_at,
      assigned_source = EXCLUDED.assigned_source,
      provider_group = EXCLUDED.provider_group,
      weekly_limit_usd = EXCLUDED.weekly_limit_usd,
      monthly_limit_usd = EXCLUDED.monthly_limit_usd,
      total_limit_usd = EXCLUDED.total_limit_usd,
      rpm_limit = EXCLUDED.rpm_limit,
      cch_user_id = EXCLUDED.cch_user_id,
      default_key_id = EXCLUDED.default_key_id,
      notes = EXCLUDED.notes,
      updated_at = now()
    RETURNING id, source_order_id, plan_id
  `;

  return { link, subscription };
}

async function main() {
  assertRuntimeAllowed();

  const dsn = process.env.DSN?.trim();
  if (!dsn) fail("DSN is required in .env.local.");
  const dsnInfo = assertLocalDsn(dsn);

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: true,
          dsn: dsnInfo,
          plans: PLANS.map(publicPlan),
          mockSubscription: {
            portalUserId: MOCK_PORTAL_USER_ID,
            sourceOrderId: MOCK_SOURCE_ORDER_ID,
            email: MOCK_EMAIL,
            planId: "pro",
          },
        },
        null,
        2
      )
    );
    return;
  }

  const sql = postgres(dsn, { max: 1 });
  try {
    const result = await sql.begin(async (tx) => {
      await upsertProviderGroups(tx);
      await upsertUserGroupConfigs(tx);
      const planRows = await upsertPlans(tx);
      const proPlan = PLANS.find((plan) => plan.planId === "pro");
      const mock = await createOrUpdateMockUser(tx, proPlan, new Date());
      return { planRows, mock };
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          dsn: dsnInfo,
          groups: [
            { groupName: PORTAL_GROUP, kind: "portal", portalManaged: true },
            { groupName: TEST_KEY_GROUP, kind: "test_key", portalManaged: false },
          ],
          plans: result.planRows.map((row) => ({
            id: row.id,
            planId: row.plan_id,
            enabled: row.enabled,
          })),
          mockSubscription: {
            portalUserId: MOCK_PORTAL_USER_ID,
            sourceOrderId: result.mock.subscription.source_order_id,
            planId: result.mock.subscription.plan_id,
            cchUserId: result.mock.link.cch_user_id,
            defaultKeyId: result.mock.link.default_key_id,
          },
        },
        null,
        2
      )
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
