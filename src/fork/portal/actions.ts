"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/actions/types";
import { getPortalConfig } from "@/fork/portal/config";
import {
  deletePortalPlan as deletePortalPlanRepository,
  findPortalSubscriptionById,
  listPortalPlans as listPortalPlansRepository,
  listPortalSubscriptions as listPortalSubscriptionsRepository,
  listPortalUserLinks as listPortalUserLinksRepository,
  setPortalPlanEnabled as setPortalPlanEnabledRepository,
  setPortalSubscriptionStatus,
  upsertPortalPlan as upsertPortalPlanRepository,
} from "@/fork/portal/repository/portal";
import { findTemporaryKeyBatchesByGroup } from "@/fork/portal/repository/temporary-key-batches";
import {
  createTemporaryKeyBatch,
  deleteTemporaryKeyBatch as deleteTemporaryKeyBatchService,
  getTemporaryKeyBatchForDownload,
} from "@/fork/portal/services/temporary-key-batches";
import {
  serializePortalPlan,
  serializePortalProvisionResult,
  serializePortalSubscription,
  serializePortalUserLink,
} from "@/fork/portal/serialization";
import { PortalSubscriptionError, provisionPortalSubscription as provisionPortalSubscriptionService } from "@/fork/portal/subscriptions";
import type {
  ProvisionPortalSubscriptionInput,
  UpsertPortalPlanInput,
} from "@/fork/portal/types/portal";
import { findKeyListBatch } from "@/repository/key";
import { findUserList } from "@/repository/user";
import type { Key } from "@/types/key";
import type { User } from "@/types/user";
import { normalizeProviderGroup, parseProviderGroups } from "@/lib/utils/provider-group";
import { logger } from "@/lib/logger";

type PortalUserEntry = {
  user: User;
  keys: Key[];
};

type PortalManagedKeyView = Omit<Key, "expiresAt" | "createdAt" | "updatedAt" | "deletedAt"> & {
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type PortalManagedUserView = Omit<
  User,
  "createdAt" | "updatedAt" | "deletedAt" | "expiresAt" | "costResetAt" | "limit5hCostResetAt"
> & {
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  costResetAt: string | null;
  limit5hCostResetAt: string | null;
  keys: PortalManagedKeyView[];
};

type PortalTemporaryKeyBatchView = {
  id: number;
  providerGroup: string;
  name: string;
  sourceUserId: number;
  sourceKeyId: number;
  createdCount: number;
  createdByUserId: number | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function isTemporaryPortalGroup(value: string | null | undefined): boolean {
  const { PORTAL_TEST_KEY_GROUP } = getPortalConfig();
  return parseProviderGroups(normalizeProviderGroup(value)).includes(PORTAL_TEST_KEY_GROUP);
}

function isManagedPortalUser(value: string | null | undefined): boolean {
  const { PORTAL_PROVIDER_GROUP, PORTAL_TEST_KEY_GROUP } = getPortalConfig();
  const groups = parseProviderGroups(normalizeProviderGroup(value));
  return groups.includes(PORTAL_PROVIDER_GROUP) || groups.includes(PORTAL_TEST_KEY_GROUP);
}

function sortPortalUsers(users: PortalUserEntry[]): PortalUserEntry[] {
  return [...users].sort((a, b) => {
    const aTemporary = isTemporaryPortalGroup(a.user.providerGroup);
    const bTemporary = isTemporaryPortalGroup(b.user.providerGroup);
    if (aTemporary !== bTemporary) return aTemporary ? -1 : 1;
    return a.user.id - b.user.id;
  });
}

function sortPortalKeys(keys: Key[]): Key[] {
  return [...keys].sort((a, b) => {
    const aTemporary = isTemporaryPortalGroup(a.providerGroup);
    const bTemporary = isTemporaryPortalGroup(b.providerGroup);
    if (aTemporary !== bTemporary) return aTemporary ? -1 : 1;
    if (a.createdAt.getTime() !== b.createdAt.getTime()) {
      return a.createdAt.getTime() - b.createdAt.getTime();
    }
    return a.id - b.id;
  });
}

function serializePortalKeyView(key: Key): PortalManagedKeyView {
  return {
    ...key,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString(),
    updatedAt: key.updatedAt.toISOString(),
    deletedAt: key.deletedAt?.toISOString() ?? null,
  };
}

function serializePortalUserView(user: User, keys: Key[]): PortalManagedUserView {
  return {
    ...user,
    expiresAt: user.expiresAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    deletedAt: user.deletedAt?.toISOString() ?? null,
    costResetAt: user.costResetAt?.toISOString() ?? null,
    limit5hCostResetAt: user.limit5hCostResetAt?.toISOString() ?? null,
    keys: keys.map(serializePortalKeyView),
  };
}

function serializePortalTemporaryKeyBatchView(
  batch: Awaited<ReturnType<typeof findTemporaryKeyBatchesByGroup>>[number]
): PortalTemporaryKeyBatchView {
  return {
    id: batch.id,
    providerGroup: batch.providerGroup,
    name: batch.name,
    sourceUserId: batch.sourceUserId,
    sourceKeyId: batch.sourceKeyId,
    createdCount: batch.createdCount,
    createdByUserId: batch.createdByUserId,
    deletedAt: batch.deletedAt?.toISOString() ?? null,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
  };
}

export async function listPortalPlans(input?: {
  includeDisabled?: boolean;
}): Promise<ActionResult<{ plans: ReturnType<typeof serializePortalPlan>[] }>> {
  try {
    const plans = await listPortalPlansRepository({
      includeDisabled: input?.includeDisabled ?? false,
    });
    return { ok: true, data: { plans: plans.map(serializePortalPlan) } };
  } catch (error) {
    logger.error("Failed to list portal plans:", error);
    return { ok: false, error: "Failed to list portal plans" };
  }
}

export async function upsertPortalPlan(
  input: UpsertPortalPlanInput
): Promise<ActionResult<{ plan: ReturnType<typeof serializePortalPlan> }>> {
  try {
    const plan = await upsertPortalPlanRepository(input);
    revalidatePath("/dashboard/portal");
    return { ok: true, data: { plan: serializePortalPlan(plan) } };
  } catch (error) {
    logger.error("Failed to save portal plan:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save portal plan",
    };
  }
}

export async function setPortalPlanEnabled(input: {
  planId: string;
  enabled: boolean;
}): Promise<ActionResult<{ plan: ReturnType<typeof serializePortalPlan> }>> {
  try {
    const plan = await setPortalPlanEnabledRepository(input.planId, input.enabled);
    if (!plan) return { ok: false, error: "Portal plan not found" };
    revalidatePath("/dashboard/portal");
    return { ok: true, data: { plan: serializePortalPlan(plan) } };
  } catch (error) {
    logger.error("Failed to update portal plan status:", error);
    return { ok: false, error: "Failed to update portal plan status" };
  }
}

export async function deletePortalPlan(input: {
  planId: string;
}): Promise<ActionResult<{ plan: ReturnType<typeof serializePortalPlan> }>> {
  try {
    const plan = await deletePortalPlanRepository(input.planId);
    if (!plan) return { ok: false, error: "Portal plan not found" };
    revalidatePath("/dashboard/portal");
    return { ok: true, data: { plan: serializePortalPlan(plan) } };
  } catch (error) {
    logger.error("Failed to delete portal plan:", error);
    return { ok: false, error: "Failed to delete portal plan" };
  }
}

export async function provisionPortalSubscription(
  input: ProvisionPortalSubscriptionInput
): Promise<ActionResult<{ result: ReturnType<typeof serializePortalProvisionResult> }>> {
  try {
    const result = await provisionPortalSubscriptionService(input);
    revalidatePath("/dashboard/portal");
    return { ok: true, data: { result: serializePortalProvisionResult(result) } };
  } catch (error) {
    logger.error("Failed to provision portal subscription:", error);
    if (error instanceof PortalSubscriptionError) {
      return { ok: false, error: error.message, errorCode: error.code };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to provision portal subscription",
    };
  }
}

export async function listPortalSubscriptions(input?: {
  limit?: number;
}): Promise<ActionResult<{ subscriptions: ReturnType<typeof serializePortalSubscription>[] }>> {
  try {
    const subscriptions = await listPortalSubscriptionsRepository(input?.limit ?? 100);
    return {
      ok: true,
      data: { subscriptions: subscriptions.map(serializePortalSubscription) },
    };
  } catch (error) {
    logger.error("Failed to list portal subscriptions:", error);
    return { ok: false, error: "Failed to list portal subscriptions" };
  }
}

export async function listPortalUserLinks(input?: {
  limit?: number;
}): Promise<ActionResult<{ users: ReturnType<typeof serializePortalUserLink>[] }>> {
  try {
    const users = await listPortalUserLinksRepository(input?.limit ?? 100);
    return { ok: true, data: { users: users.map(serializePortalUserLink) } };
  } catch (error) {
    logger.error("Failed to list portal users:", error);
    return { ok: false, error: "Failed to list portal users" };
  }
}

export async function listPortalManagedUsers(input?: {
  limit?: number;
}): Promise<ActionResult<{ users: PortalManagedUserView[] }>> {
  try {
    const users = await findUserList(input?.limit ?? 100, 0);
    const keyMap = await findKeyListBatch(users.map((user) => user.id));
    const managedUsers = sortPortalUsers(
      users.filter((user) => isManagedPortalUser(user.providerGroup)).map((user) => ({
        user,
        keys: sortPortalKeys(keyMap.get(user.id) ?? []),
      }))
    );

    return {
      ok: true,
      data: {
        users: managedUsers.map((entry) => serializePortalUserView(entry.user, entry.keys)),
      },
    };
  } catch (error) {
    logger.error("Failed to list portal managed users:", error);
    return { ok: false, error: "Failed to list portal managed users" };
  }
}

export async function listPortalTemporaryKeyBatches(input?: {
  limit?: number;
}): Promise<ActionResult<{ batches: PortalTemporaryKeyBatchView[] }>> {
  try {
    const { PORTAL_TEST_KEY_GROUP } = getPortalConfig();
    const batches = await findTemporaryKeyBatchesByGroup(PORTAL_TEST_KEY_GROUP);
    const limited = batches.slice(0, Math.max(1, Math.min(input?.limit ?? 100, 500)));
    return {
      ok: true,
      data: { batches: limited.map(serializePortalTemporaryKeyBatchView) },
    };
  } catch (error) {
    logger.error("Failed to list portal temporary key batches:", error);
    return { ok: false, error: "Failed to list portal temporary key batches" };
  }
}

export async function createPortalTemporaryKeyBatch(input: {
  sourceUserId: number;
  sourceKeyId: number;
  count: number;
  name?: string;
  customLimitTotalUsd?: number | null;
}): Promise<ActionResult<{ batchId: number; keyCount: number }>> {
  try {
    const { PORTAL_TEST_KEY_GROUP } = getPortalConfig();
    const result = await createTemporaryKeyBatch({
      providerGroup: PORTAL_TEST_KEY_GROUP,
      sourceUserId: input.sourceUserId,
      sourceKeyId: input.sourceKeyId,
      count: input.count,
      name: input.name,
      customLimitTotalUsd: input.customLimitTotalUsd,
      createdByUserId: null,
    });
    revalidatePath("/dashboard/portal");
    return { ok: true, data: { batchId: result.batch.id, keyCount: result.keys.length } };
  } catch (error) {
    logger.error("Failed to create portal temporary key batch:", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to create portal temporary key batch",
    };
  }
}

export async function downloadPortalTemporaryKeyBatch(input: {
  batchId: number;
}): Promise<ActionResult<{ batchId: number; keys: PortalManagedKeyView[] }>> {
  try {
    const { PORTAL_TEST_KEY_GROUP } = getPortalConfig();
    const result = await getTemporaryKeyBatchForDownload(input.batchId, PORTAL_TEST_KEY_GROUP);
    return {
      ok: true,
      data: {
        batchId: result.batch.id,
        keys: result.keys.map(serializePortalKeyView),
      },
    };
  } catch (error) {
    logger.error("Failed to download portal temporary key batch:", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to download portal temporary key batch",
    };
  }
}

export async function deletePortalTemporaryKeyBatch(input: {
  batchId: number;
}): Promise<ActionResult<{ batchId: number }>> {
  try {
    const { PORTAL_TEST_KEY_GROUP } = getPortalConfig();
    const result = await deleteTemporaryKeyBatchService({
      batchId: input.batchId,
      providerGroup: PORTAL_TEST_KEY_GROUP,
    });
    revalidatePath("/dashboard/portal");
    return { ok: true, data: { batchId: result.batchId } };
  } catch (error) {
    logger.error("Failed to delete portal temporary key batch:", error);
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to delete portal temporary key batch",
    };
  }
}

export async function getPortalSubscription(input: {
  id: number;
}): Promise<ActionResult<{ subscription: ReturnType<typeof serializePortalSubscription> }>> {
  try {
    const subscription = await findPortalSubscriptionById(input.id);
    if (!subscription) return { ok: false, error: "Portal subscription not found" };
    return { ok: true, data: { subscription: serializePortalSubscription(subscription) } };
  } catch (error) {
    logger.error("Failed to get portal subscription:", error);
    return { ok: false, error: "Failed to get portal subscription" };
  }
}

export async function revokePortalSubscription(input: {
  id: number;
}): Promise<ActionResult<{ subscription: ReturnType<typeof serializePortalSubscription> }>> {
  try {
    const subscription = await setPortalSubscriptionStatus(input.id, "revoked");
    if (!subscription) return { ok: false, error: "Portal subscription not found" };
    revalidatePath("/dashboard/portal");
    return { ok: true, data: { subscription: serializePortalSubscription(subscription) } };
  } catch (error) {
    logger.error("Failed to revoke portal subscription:", error);
    return { ok: false, error: "Failed to revoke portal subscription" };
  }
}
