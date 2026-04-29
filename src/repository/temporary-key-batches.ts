import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/drizzle/db";
import { keys, temporaryKeyBatchKeys, temporaryKeyBatches } from "@/drizzle/schema";
import { CHANNEL_API_KEYS_UPDATED, publishCacheInvalidation } from "@/lib/redis/pubsub";
import { cacheActiveKey } from "@/lib/security/api-key-auth-cache";
import { apiKeyVacuumFilter } from "@/lib/security/api-key-vacuum-filter";
import { toKey } from "@/repository/_shared/transformers";
import type { CreateKeyData, Key } from "@/types/key";
import type {
  CreateTemporaryKeyBatchResult,
  TemporaryKeyBatch,
  TemporaryKeyBatchWithKeys,
} from "@/types/temporary-key-batch";

type TemporaryKeyBatchRow = typeof temporaryKeyBatches.$inferSelect;

function toTemporaryKeyBatch(row: TemporaryKeyBatchRow): TemporaryKeyBatch {
  return {
    id: row.id,
    providerGroup: row.providerGroup,
    name: row.name,
    sourceUserId: row.sourceUserId,
    sourceKeyId: row.sourceKeyId,
    createdCount: row.createdCount,
    createdByUserId: row.createdByUserId ?? null,
    deletedAt: row.deletedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function createKeyInsertValues(keyData: CreateKeyData) {
  return {
    userId: keyData.user_id,
    key: keyData.key,
    name: keyData.name,
    isEnabled: keyData.is_enabled,
    expiresAt: keyData.expires_at,
    canLoginWebUi: keyData.can_login_web_ui ?? true,
    limit5hUsd: keyData.limit_5h_usd != null ? keyData.limit_5h_usd.toString() : null,
    limit5hResetMode: keyData.limit_5h_reset_mode ?? "rolling",
    limitDailyUsd: keyData.limit_daily_usd != null ? keyData.limit_daily_usd.toString() : null,
    dailyResetMode: keyData.daily_reset_mode ?? "fixed",
    dailyResetTime: keyData.daily_reset_time ?? "00:00",
    limitWeeklyUsd: keyData.limit_weekly_usd != null ? keyData.limit_weekly_usd.toString() : null,
    limitMonthlyUsd:
      keyData.limit_monthly_usd != null ? keyData.limit_monthly_usd.toString() : null,
    limitTotalUsd: keyData.limit_total_usd != null ? keyData.limit_total_usd.toString() : null,
    costResetAt: keyData.cost_reset_at ?? null,
    limitConcurrentSessions: keyData.limit_concurrent_sessions,
    providerGroup: keyData.provider_group ?? null,
    cacheTtlPreference: keyData.cache_ttl_preference ?? null,
  };
}

const keyReturningFields = {
  id: keys.id,
  userId: keys.userId,
  key: keys.key,
  name: keys.name,
  isEnabled: keys.isEnabled,
  expiresAt: keys.expiresAt,
  canLoginWebUi: keys.canLoginWebUi,
  limit5hUsd: keys.limit5hUsd,
  limit5hResetMode: keys.limit5hResetMode,
  limitDailyUsd: keys.limitDailyUsd,
  dailyResetMode: keys.dailyResetMode,
  dailyResetTime: keys.dailyResetTime,
  limitWeeklyUsd: keys.limitWeeklyUsd,
  limitMonthlyUsd: keys.limitMonthlyUsd,
  limitTotalUsd: keys.limitTotalUsd,
  costResetAt: keys.costResetAt,
  limitConcurrentSessions: keys.limitConcurrentSessions,
  providerGroup: keys.providerGroup,
  cacheTtlPreference: keys.cacheTtlPreference,
  createdAt: keys.createdAt,
  updatedAt: keys.updatedAt,
  deletedAt: keys.deletedAt,
};

export async function createTemporaryKeyBatchWithKeys(input: {
  providerGroup: string;
  name: string;
  sourceUserId: number;
  sourceKeyId: number;
  createdByUserId?: number | null;
  keys: CreateKeyData[];
}): Promise<CreateTemporaryKeyBatchResult> {
  const result = await db.transaction(async (tx) => {
    const [batchRow] = await tx
      .insert(temporaryKeyBatches)
      .values({
        providerGroup: input.providerGroup,
        name: input.name,
        sourceUserId: input.sourceUserId,
        sourceKeyId: input.sourceKeyId,
        createdCount: input.keys.length,
        createdByUserId: input.createdByUserId ?? null,
      })
      .returning();

    const createdKeyRows = await tx
      .insert(keys)
      .values(input.keys.map(createKeyInsertValues))
      .returning(keyReturningFields);

    if (createdKeyRows.length > 0) {
      await tx.insert(temporaryKeyBatchKeys).values(
        createdKeyRows.map((row) => ({
          batchId: batchRow.id,
          keyId: row.id,
        }))
      );
    }

    return {
      batch: toTemporaryKeyBatch(batchRow),
      keys: createdKeyRows.map(toKey),
    };
  });

  for (const key of result.keys) {
    try {
      apiKeyVacuumFilter.noteExistingKey(key.key);
    } catch {
      // ignore
    }
    await cacheActiveKey(key).catch(() => {});
  }

  const rateLimitRaw = process.env.ENABLE_RATE_LIMIT?.trim();
  if (process.env.REDIS_URL && rateLimitRaw !== "false" && rateLimitRaw !== "0") {
    await publishCacheInvalidation(CHANNEL_API_KEYS_UPDATED).catch(() => {});
  }

  return result;
}

export async function findTemporaryKeyBatchById(
  batchId: number
): Promise<TemporaryKeyBatch | null> {
  const [row] = await db
    .select()
    .from(temporaryKeyBatches)
    .where(eq(temporaryKeyBatches.id, batchId))
    .limit(1);

  return row ? toTemporaryKeyBatch(row) : null;
}

export async function findTemporaryKeyBatchWithKeys(
  batchId: number
): Promise<TemporaryKeyBatchWithKeys | null> {
  const batch = await findTemporaryKeyBatchById(batchId);
  if (!batch) return null;

  const rows = await db
    .select(keyReturningFields)
    .from(temporaryKeyBatchKeys)
    .innerJoin(keys, eq(temporaryKeyBatchKeys.keyId, keys.id))
    .where(eq(temporaryKeyBatchKeys.batchId, batchId));

  return {
    ...batch,
    keys: rows.map(toKey),
  };
}

export async function markTemporaryKeyBatchDeleted(batchId: number): Promise<void> {
  await db
    .update(temporaryKeyBatches)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(temporaryKeyBatches.id, batchId), isNull(temporaryKeyBatches.deletedAt)));
}

export async function findTemporaryKeyBatchesByGroup(
  providerGroup: string
): Promise<TemporaryKeyBatch[]> {
  const rows = await db
    .select()
    .from(temporaryKeyBatches)
    .where(eq(temporaryKeyBatches.providerGroup, providerGroup));

  return rows.map(toTemporaryKeyBatch);
}

export async function findTemporaryKeyIdsForBatch(batchId: number): Promise<number[]> {
  const rows = await db
    .select({ keyId: temporaryKeyBatchKeys.keyId })
    .from(temporaryKeyBatchKeys)
    .where(eq(temporaryKeyBatchKeys.batchId, batchId));

  return rows.map((row) => row.keyId);
}

export async function findKeysByIds(keyIds: number[]): Promise<Key[]> {
  if (keyIds.length === 0) return [];

  const rows = await db
    .select(keyReturningFields)
    .from(keys)
    .where(inArray(keys.id, keyIds));

  return rows.map(toKey);
}
