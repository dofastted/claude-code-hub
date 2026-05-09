import "server-only";

import { randomBytes } from "node:crypto";
import { getPortalConfig } from "@/fork/portal/config";
import {
  createTemporaryKeyBatchWithKeys,
  findTemporaryKeyBatchWithKeys,
  markTemporaryKeyBatchDeleted,
} from "@/fork/portal/repository/temporary-key-batches";
import {
  ensureDefaultUserGroupConfigs,
  findUserGroupConfigByName,
} from "@/fork/portal/repository/user-group-configs";
import type {
  CreateTemporaryKeyBatchInput,
  CreateTemporaryKeyBatchResult,
  DeleteTemporaryKeyBatchResult,
} from "@/fork/portal/types/temporary-key-batch";
import { buildDefaultUserGroupConfigs } from "@/fork/portal/user-groups/defaults";
import { syncUserProviderGroupFromKeysForSystem } from "@/fork/portal/user-groups/sync";
import { PROVIDER_GROUP } from "@/lib/constants/provider.constants";
import { normalizeProviderGroup, parseProviderGroups } from "@/lib/utils/provider-group";
import { deleteKey, findKeyById } from "@/repository/key";
import { ensureProviderGroupsExist } from "@/repository/provider-groups";
import { findUserById } from "@/repository/user";
import type { CreateKeyData, Key } from "@/types/key";

export class TemporaryKeyBatchError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "TemporaryKeyBatchError";
    this.code = code;
    this.status = status;
  }
}

async function ensureBuiltinUserGroupConfigs(): Promise<void> {
  const env = getPortalConfig();
  await ensureDefaultUserGroupConfigs(
    buildDefaultUserGroupConfigs({
      portalGroup: env.PORTAL_PROVIDER_GROUP,
      testKeyGroup: env.PORTAL_TEST_KEY_GROUP,
    })
  );
}

function normalizeSingleGroup(value: string): string {
  const normalized = normalizeProviderGroup(value);
  const groups = parseProviderGroups(normalized);
  if (groups.length !== 1 || groups[0] === PROVIDER_GROUP.ALL) {
    throw new TemporaryKeyBatchError("必须指定一个具体分组", "INVALID_PROVIDER_GROUP");
  }
  return groups[0];
}

async function assertTemporaryKeysEnabled(providerGroup: string): Promise<void> {
  await ensureBuiltinUserGroupConfigs();
  await ensureProviderGroupsExist([providerGroup]);

  const config = await findUserGroupConfigByName(providerGroup);
  if (!config?.temporaryKeysEnabled) {
    throw new TemporaryKeyBatchError("该分组未开启临时 key 功能", "TEMPORARY_KEYS_DISABLED", 403);
  }
}

function buildTemporaryKeyData(args: {
  baseKey: Key;
  generatedKey: string;
  name: string;
  providerGroup: string;
  customLimitTotalUsd?: number | null;
}): CreateKeyData {
  return {
    user_id: args.baseKey.userId,
    name: args.name,
    key: args.generatedKey,
    is_enabled: true,
    expires_at: args.baseKey.expiresAt ?? null,
    can_login_web_ui: args.baseKey.canLoginWebUi,
    limit_5h_usd: args.baseKey.limit5hUsd,
    limit_5h_reset_mode: args.baseKey.limit5hResetMode,
    limit_daily_usd: args.baseKey.limitDailyUsd,
    daily_reset_mode: args.baseKey.dailyResetMode,
    daily_reset_time: args.baseKey.dailyResetTime,
    limit_weekly_usd: args.baseKey.limitWeeklyUsd,
    limit_monthly_usd: args.baseKey.limitMonthlyUsd,
    limit_total_usd:
      args.customLimitTotalUsd !== undefined
        ? args.customLimitTotalUsd
        : args.baseKey.limitTotalUsd,
    cost_reset_at: args.baseKey.costResetAt ?? null,
    limit_concurrent_sessions: args.baseKey.limitConcurrentSessions,
    provider_group: args.providerGroup,
    cache_ttl_preference: args.baseKey.cacheTtlPreference ?? undefined,
  };
}

function createBatchName(inputName: string | undefined, providerGroup: string): string {
  const normalized = inputName?.trim();
  if (normalized) return normalized;
  return `tmp-${providerGroup}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

export async function createTemporaryKeyBatch(
  input: CreateTemporaryKeyBatchInput
): Promise<CreateTemporaryKeyBatchResult> {
  const providerGroup = normalizeSingleGroup(input.providerGroup);
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 500) {
    throw new TemporaryKeyBatchError("count 必须在 1 到 500 之间", "INVALID_COUNT");
  }

  await assertTemporaryKeysEnabled(providerGroup);

  const user = await findUserById(input.sourceUserId);
  if (!user) {
    throw new TemporaryKeyBatchError("用户不存在", "USER_NOT_FOUND", 404);
  }

  const baseKey = await findKeyById(input.sourceKeyId);
  if (!baseKey || baseKey.userId !== input.sourceUserId) {
    throw new TemporaryKeyBatchError("基础 key 不存在或不属于该用户", "BASE_KEY_NOT_FOUND", 404);
  }
  if (!baseKey.isEnabled) {
    throw new TemporaryKeyBatchError("基础 key 已停用", "BASE_KEY_DISABLED", 409);
  }

  const batchName = createBatchName(input.name, providerGroup);
  const suffix = randomBytes(3).toString("hex");
  const keyData: CreateKeyData[] = Array.from({ length: input.count }, (_, index) =>
    buildTemporaryKeyData({
      baseKey,
      generatedKey: `sk-${randomBytes(16).toString("hex")}`,
      name: `${batchName}-${String(index + 1).padStart(3, "0")}-${suffix}`,
      providerGroup,
      customLimitTotalUsd: input.customLimitTotalUsd,
    })
  );

  const result = await createTemporaryKeyBatchWithKeys({
    providerGroup,
    name: batchName,
    sourceUserId: input.sourceUserId,
    sourceKeyId: input.sourceKeyId,
    createdByUserId: input.createdByUserId ?? null,
    keys: keyData,
  });

  await syncUserProviderGroupFromKeysForSystem(input.sourceUserId);
  return result;
}

export async function getTemporaryKeyBatchForDownload(
  batchId: number,
  providerGroup: string
): Promise<CreateTemporaryKeyBatchResult> {
  const normalizedGroup = normalizeSingleGroup(providerGroup);
  const batch = await findTemporaryKeyBatchWithKeys(batchId);
  if (!batch || batch.providerGroup !== normalizedGroup) {
    throw new TemporaryKeyBatchError("临时 key 批次不存在", "BATCH_NOT_FOUND", 404);
  }

  return { batch, keys: batch.keys.filter((key) => !key.deletedAt) };
}

export async function deleteTemporaryKeyBatch(input: {
  batchId: number;
  providerGroup: string;
}): Promise<DeleteTemporaryKeyBatchResult> {
  const providerGroup = normalizeSingleGroup(input.providerGroup);
  await assertTemporaryKeysEnabled(providerGroup);

  const batch = await findTemporaryKeyBatchWithKeys(input.batchId);
  if (!batch || batch.providerGroup !== providerGroup || batch.deletedAt) {
    throw new TemporaryKeyBatchError("临时 key 批次不存在", "BATCH_NOT_FOUND", 404);
  }

  const keysToDelete = batch.keys.filter(
    (key) => !key.deletedAt && normalizeProviderGroup(key.providerGroup) === providerGroup
  );
  if (keysToDelete.length === 0) {
    await markTemporaryKeyBatchDeleted(batch.id);
    return { batchId: batch.id, deletedKeyIds: [], affectedUserIds: [] };
  }

  const affectedUserIds = Array.from(new Set(keysToDelete.map((key) => key.userId)));
  const deletedKeyIds: number[] = [];
  for (const key of keysToDelete) {
    const deleted = await deleteKey(key.id);
    if (deleted) deletedKeyIds.push(key.id);
  }

  await markTemporaryKeyBatchDeleted(batch.id);
  await Promise.all(
    affectedUserIds.map((userId) => syncUserProviderGroupFromKeysForSystem(userId))
  );

  return {
    batchId: batch.id,
    deletedKeyIds,
    affectedUserIds,
  };
}
