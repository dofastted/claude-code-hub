import "server-only";

import { randomBytes } from "node:crypto";
import { DEFAULT_PORTAL_GROUP } from "@/lib/user-groups/defaults";
import { createKey, findKeyById, findKeyList, updateKey } from "@/repository/key";
import {
  createPortalSubscription,
  findPortalPlanByPlanId,
  findPortalSubscriptionBySourceOrderId,
  findPortalUserLinkByPortalUserId,
  upsertPortalUserLink,
} from "@/repository/portal";
import { createUser, findUserById, updateUser } from "@/repository/user";
import type { Key } from "@/types/key";
import type {
  PortalPlan,
  PortalSubscription,
  PortalUserLink,
  ProvisionPortalSubscriptionInput,
  ProvisionPortalSubscriptionResult,
} from "@/types/portal";
import type { User } from "@/types/user";

export class PortalSubscriptionError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "PortalSubscriptionError";
    this.code = code;
    this.status = status;
  }
}

export interface PortalProvisionDependencies {
  findPlanByPlanId: typeof findPortalPlanByPlanId;
  findSubscriptionBySourceOrderId: typeof findPortalSubscriptionBySourceOrderId;
  findUserLinkByPortalUserId: typeof findPortalUserLinkByPortalUserId;
  upsertUserLink: typeof upsertPortalUserLink;
  createSubscription: typeof createPortalSubscription;
  findUserById: typeof findUserById;
  createUser: typeof createUser;
  updateUser: typeof updateUser;
  findKeyById: typeof findKeyById;
  findKeyList: typeof findKeyList;
  createKey: typeof createKey;
  updateKey: typeof updateKey;
  now: () => Date;
  generateKey: () => string;
}

const defaultDependencies: PortalProvisionDependencies = {
  findPlanByPlanId: findPortalPlanByPlanId,
  findSubscriptionBySourceOrderId: findPortalSubscriptionBySourceOrderId,
  findUserLinkByPortalUserId: findPortalUserLinkByPortalUserId,
  upsertUserLink: upsertPortalUserLink,
  createSubscription: createPortalSubscription,
  findUserById,
  createUser,
  updateUser,
  findKeyById,
  findKeyList,
  createKey,
  updateKey,
  now: () => new Date(),
  generateKey: () => `sk-${randomBytes(16).toString("hex")}`,
};

function trimRequired(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new PortalSubscriptionError(`${field} is required`, "INVALID_INPUT");
  }
  return trimmed;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function resolveNewExpiry(user: User | null, plan: PortalPlan, now: Date): Date {
  const existingExpiry =
    user?.expiresAt instanceof Date && user.expiresAt.getTime() > now.getTime()
      ? user.expiresAt
      : now;
  return plan.validDays > 0 ? addDays(existingExpiry, plan.validDays) : existingExpiry;
}

function resolveNewTotal(user: User | null, plan: PortalPlan): number {
  const currentTotal =
    typeof user?.limitTotalUsd === "number" && Number.isFinite(user.limitTotalUsd)
      ? user.limitTotalUsd
      : 0;
  return currentTotal + plan.totalLimitUsd;
}

function keyPayload(args: {
  plan: PortalPlan;
  expiresAt: Date;
  totalLimitUsd: number;
  providerGroup: string;
}) {
  return {
    expires_at: args.expiresAt,
    can_login_web_ui: true,
    is_enabled: true,
    provider_group: args.providerGroup,
    limit_weekly_usd: args.plan.weeklyLimitUsd,
    limit_monthly_usd: args.plan.monthlyLimitUsd,
    limit_total_usd: args.totalLimitUsd,
  };
}

function userPayload(args: {
  plan: PortalPlan;
  expiresAt: Date;
  totalLimitUsd: number;
  providerGroup: string;
}) {
  return {
    rpm: args.plan.rpmLimit || 30,
    providerGroup: args.providerGroup,
    limitWeeklyUsd: args.plan.weeklyLimitUsd,
    limitMonthlyUsd: args.plan.monthlyLimitUsd,
    limitTotalUsd: args.totalLimitUsd,
    expiresAt: args.expiresAt,
    isEnabled: true,
  };
}

async function resolveLinkedUserAndKey(
  link: PortalUserLink | null,
  deps: PortalProvisionDependencies
): Promise<{ user: User | null; key: Key | null }> {
  if (!link) return { user: null, key: null };

  const user = await deps.findUserById(link.cchUserId);
  let key = await deps.findKeyById(link.defaultKeyId);
  if (!key && user) {
    const keys = await deps.findKeyList(user.id);
    key = keys.find((item) => item.name === "default") ?? null;
  }

  return { user, key };
}

function resultFromExisting(args: {
  plan: PortalPlan;
  link: PortalUserLink;
  subscription: PortalSubscription;
  user: User;
  key: Key;
}): ProvisionPortalSubscriptionResult {
  return {
    idempotent: true,
    plan: args.plan,
    portalUser: args.link,
    subscription: args.subscription,
    cchUser: {
      id: args.user.id,
      name: args.user.name,
      expiresAt: args.user.expiresAt ?? null,
      rpm: args.user.rpm,
      providerGroup: args.user.providerGroup,
      limitWeeklyUsd: args.user.limitWeeklyUsd ?? null,
      limitMonthlyUsd: args.user.limitMonthlyUsd ?? null,
      limitTotalUsd: args.user.limitTotalUsd ?? null,
    },
    defaultKey: {
      id: args.key.id,
      name: args.key.name,
      key: args.key.key,
      expiresAt: args.key.expiresAt,
      providerGroup: args.key.providerGroup,
      limitWeeklyUsd: args.key.limitWeeklyUsd,
      limitMonthlyUsd: args.key.limitMonthlyUsd,
      limitTotalUsd: args.key.limitTotalUsd,
    },
  };
}

function assertIdempotentRequestMatchesSubscription(args: {
  input: {
    portalUserId: string;
    email: string;
    planId: string;
  };
  subscription: PortalSubscription;
}): void {
  const subscriptionEmail = args.subscription.email.trim().toLowerCase();
  if (
    args.subscription.portalUserId !== args.input.portalUserId ||
    subscriptionEmail !== args.input.email ||
    args.subscription.planId !== args.input.planId
  ) {
    throw new PortalSubscriptionError(
      "sourceOrderId already exists for a different portal subscription",
      "IDEMPOTENCY_CONFLICT",
      409
    );
  }
}

function planFromSubscription(plan: PortalPlan, subscription: PortalSubscription): PortalPlan {
  return {
    ...plan,
    planId: subscription.planId,
    providerGroup: subscription.providerGroup,
    weeklyLimitUsd: subscription.weeklyLimitUsd,
    monthlyLimitUsd: subscription.monthlyLimitUsd,
    totalLimitUsd: subscription.totalLimitUsd,
    rpmLimit: subscription.rpmLimit,
  };
}

export async function provisionPortalSubscription(
  input: ProvisionPortalSubscriptionInput,
  dependencies: Partial<PortalProvisionDependencies> = {}
): Promise<ProvisionPortalSubscriptionResult> {
  const deps = { ...defaultDependencies, ...dependencies };
  const sourceOrderId = trimRequired(input.sourceOrderId, "sourceOrderId");
  const portalUserId = trimRequired(input.portalUserId, "portalUserId");
  const email = trimRequired(input.email, "email").toLowerCase();
  const planId = trimRequired(input.planId, "planId");

  const existingSubscription = await deps.findSubscriptionBySourceOrderId(sourceOrderId);

  if (existingSubscription) {
    assertIdempotentRequestMatchesSubscription({
      input: { portalUserId, email, planId },
      subscription: existingSubscription,
    });

    const existingPlan = await deps.findPlanByPlanId(existingSubscription.planId);
    if (!existingPlan || existingPlan.deletedAt) {
      throw new PortalSubscriptionError("Portal plan is not available", "PLAN_NOT_AVAILABLE", 404);
    }

    const existingLink = await deps.findUserLinkByPortalUserId(existingSubscription.portalUserId);
    const { user: linkedUser, key: linkedKey } = await resolveLinkedUserAndKey(existingLink, deps);
    if (!existingLink || !linkedUser || !linkedKey) {
      throw new PortalSubscriptionError(
        "Existing portal subscription is missing its user link",
        "PORTAL_LINK_MISSING",
        409
      );
    }
    return resultFromExisting({
      plan: planFromSubscription(existingPlan, existingSubscription),
      link: existingLink,
      subscription: existingSubscription,
      user: linkedUser,
      key: linkedKey,
    });
  }

  const plan = await deps.findPlanByPlanId(planId);
  if (!plan || plan.deletedAt || !plan.enabled) {
    throw new PortalSubscriptionError("Portal plan is not available", "PLAN_NOT_AVAILABLE", 404);
  }

  const existingLink = await deps.findUserLinkByPortalUserId(portalUserId);
  const { user: linkedUser, key: linkedKey } = await resolveLinkedUserAndKey(existingLink, deps);

  const now = deps.now();
  const providerGroup = plan.providerGroup || DEFAULT_PORTAL_GROUP;
  const expiresAt = resolveNewExpiry(linkedUser, plan, now);
  const totalLimitUsd = resolveNewTotal(linkedUser, plan);

  let user = linkedUser;
  if (!user) {
    user = await deps.createUser({
      name: email,
      description: `Portal user ${portalUserId}`,
      ...userPayload({ plan, expiresAt, totalLimitUsd, providerGroup }),
    });
  } else {
    const updated = await deps.updateUser(
      user.id,
      userPayload({ plan, expiresAt, totalLimitUsd, providerGroup })
    );
    if (!updated) {
      throw new PortalSubscriptionError("CCH user was not found", "CCH_USER_NOT_FOUND", 404);
    }
    user = updated;
  }

  let key = linkedKey;
  if (!key) {
    key = await deps.createKey({
      user_id: user.id,
      name: "default",
      key: deps.generateKey(),
      ...keyPayload({ plan, expiresAt, totalLimitUsd, providerGroup }),
    });
  } else {
    const updated = await deps.updateKey(
      key.id,
      keyPayload({ plan, expiresAt, totalLimitUsd, providerGroup })
    );
    if (!updated) {
      throw new PortalSubscriptionError("Default key was not found", "DEFAULT_KEY_NOT_FOUND", 404);
    }
    key = updated;
  }

  const link = await deps.upsertUserLink({
    portalUserId,
    email,
    cchUserId: user.id,
    defaultKeyId: key.id,
    lastProvisionedAt: now,
  });

  const subscription = await deps.createSubscription({
    sourceOrderId,
    portalUserId,
    email,
    planId: plan.planId,
    startsAt: now,
    expiresAt,
    assignedSource: input.assignedSource?.trim() || "portal",
    providerGroup,
    weeklyLimitUsd: plan.weeklyLimitUsd,
    monthlyLimitUsd: plan.monthlyLimitUsd,
    totalLimitUsd: plan.totalLimitUsd,
    rpmLimit: plan.rpmLimit || 30,
    cchUserId: user.id,
    defaultKeyId: key.id,
    notes: input.notes,
  });

  return {
    idempotent: false,
    plan,
    portalUser: link,
    subscription,
    cchUser: {
      id: user.id,
      name: user.name,
      expiresAt: user.expiresAt ?? null,
      rpm: user.rpm,
      providerGroup: user.providerGroup,
      limitWeeklyUsd: user.limitWeeklyUsd ?? null,
      limitMonthlyUsd: user.limitMonthlyUsd ?? null,
      limitTotalUsd: user.limitTotalUsd ?? null,
    },
    defaultKey: {
      id: key.id,
      name: key.name,
      key: key.key,
      expiresAt: key.expiresAt,
      providerGroup: key.providerGroup,
      limitWeeklyUsd: key.limitWeeklyUsd,
      limitMonthlyUsd: key.limitMonthlyUsd,
      limitTotalUsd: key.limitTotalUsd,
    },
  };
}
