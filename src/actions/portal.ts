"use server";

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import {
  serializePortalPlan,
  serializePortalProvisionResult,
  serializePortalSubscription,
  serializePortalUserLink,
} from "@/lib/portal/serialization";
import {
  PortalSubscriptionError,
  provisionPortalSubscription as provisionPortalSubscriptionService,
} from "@/lib/portal/subscriptions";
import {
  deletePortalPlan as deletePortalPlanRepository,
  findPortalSubscriptionById,
  listPortalPlans as listPortalPlansRepository,
  listPortalSubscriptions as listPortalSubscriptionsRepository,
  listPortalUserLinks as listPortalUserLinksRepository,
  setPortalPlanEnabled as setPortalPlanEnabledRepository,
  setPortalSubscriptionStatus,
  upsertPortalPlan as upsertPortalPlanRepository,
} from "@/repository/portal";
import type { ProvisionPortalSubscriptionInput, UpsertPortalPlanInput } from "@/types/portal";
import type { ActionResult } from "./types";

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
