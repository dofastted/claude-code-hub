import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Key } from "@/types/key";
import type { PortalPlan, PortalSubscription, PortalUserLink } from "@/fork/portal/types/portal";
import type { User } from "@/types/user";
import {
  type PortalSubscriptionError,
  provisionPortalSubscription,
  type PortalProvisionDependencies,
} from "@/fork/portal/subscriptions";

const now = new Date("2026-04-28T00:00:00.000Z");

function plan(overrides: Partial<PortalPlan> = {}): PortalPlan {
  return {
    id: 1,
    planId: "pro",
    name: "Pro",
    description: null,
    priceAmount: 99,
    currency: "rmb",
    validDays: 30,
    providerGroup: "portal",
    weeklyLimitUsd: 150,
    monthlyLimitUsd: 600,
    totalLimitUsd: 600,
    rpmLimit: 30,
    enabled: true,
    sortOrder: 1,
    features: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function user(overrides: Partial<User> = {}): User {
  return {
    id: 10,
    name: "buyer@example.com",
    description: "",
    role: "user",
    rpm: 30,
    dailyQuota: null,
    providerGroup: "portal",
    tags: [],
    createdAt: now,
    updatedAt: now,
    dailyResetMode: "fixed",
    dailyResetTime: "00:00",
    isEnabled: true,
    expiresAt: new Date("2026-05-28T00:00:00.000Z"),
    allowedClients: [],
    blockedClients: [],
    allowedModels: [],
    limitWeeklyUsd: 150,
    limitMonthlyUsd: 600,
    limitTotalUsd: 600,
    ...overrides,
  };
}

function key(overrides: Partial<Key> = {}): Key {
  return {
    id: 20,
    userId: 10,
    name: "default",
    key: "sk-existing",
    isEnabled: true,
    expiresAt: new Date("2026-05-28T00:00:00.000Z"),
    canLoginWebUi: true,
    limit5hUsd: null,
    limit5hResetMode: "rolling",
    limitDailyUsd: null,
    dailyResetMode: "fixed",
    dailyResetTime: "00:00",
    limitWeeklyUsd: 150,
    limitMonthlyUsd: 600,
    limitTotalUsd: 600,
    limitConcurrentSessions: 0,
    providerGroup: "portal",
    cacheTtlPreference: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function link(overrides: Partial<PortalUserLink> = {}): PortalUserLink {
  return {
    id: 30,
    portalUserId: "portal-user-1",
    email: "buyer@example.com",
    cchUserId: 10,
    defaultKeyId: 20,
    lastProvisionedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function subscription(overrides: Partial<PortalSubscription> = {}): PortalSubscription {
  return {
    id: 40,
    sourceOrderId: "order-1",
    portalUserId: "portal-user-1",
    email: "buyer@example.com",
    planId: "pro",
    status: "active",
    startsAt: now,
    expiresAt: new Date("2026-05-28T00:00:00.000Z"),
    assignedSource: "portal",
    providerGroup: "portal",
    weeklyLimitUsd: 150,
    monthlyLimitUsd: 600,
    totalLimitUsd: 600,
    rpmLimit: 30,
    cchUserId: 10,
    defaultKeyId: 20,
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function deps(overrides: Partial<PortalProvisionDependencies> = {}): PortalProvisionDependencies {
  return {
    findPlanByPlanId: vi.fn(async () => plan()),
    findSubscriptionBySourceOrderId: vi.fn(async () => null),
    findUserLinkByPortalUserId: vi.fn(async () => null),
    upsertUserLink: vi.fn(async (input) => link(input)),
    createSubscription: vi.fn(async (input) => subscription(input)),
    findUserById: vi.fn(async () => null),
    createUser: vi.fn(async (input) =>
      user({
        name: input.name,
        expiresAt: input.expiresAt,
        rpm: input.rpm ?? null,
        providerGroup: input.providerGroup ?? null,
        limitWeeklyUsd: input.limitWeeklyUsd,
        limitMonthlyUsd: input.limitMonthlyUsd,
        limitTotalUsd: input.limitTotalUsd,
      })
    ),
    updateUser: vi.fn(async (_id, input) => user(input)),
    findKeyById: vi.fn(async () => null),
    findKeyList: vi.fn(async () => []),
    createKey: vi.fn(async (input) =>
      key({
        key: input.key,
        expiresAt: input.expires_at ?? undefined,
        providerGroup: input.provider_group ?? null,
        limitWeeklyUsd: input.limit_weekly_usd ?? null,
        limitMonthlyUsd: input.limit_monthly_usd ?? null,
        limitTotalUsd: input.limit_total_usd,
      })
    ),
    updateKey: vi.fn(async (_id, input) =>
      key({
        expiresAt: input.expires_at ?? undefined,
        providerGroup: input.provider_group ?? null,
        limitWeeklyUsd: input.limit_weekly_usd ?? null,
        limitMonthlyUsd: input.limit_monthly_usd ?? null,
        limitTotalUsd: input.limit_total_usd,
      })
    ),
    now: () => now,
    generateKey: () => "sk-generated",
    ...overrides,
  };
}

describe("portal subscription provisioning", () => {
  let input: {
    sourceOrderId: string;
    portalUserId: string;
    email: string;
    planId: string;
  };

  beforeEach(() => {
    input = {
      sourceOrderId: "order-1",
      portalUserId: "portal-user-1",
      email: "BUYER@example.com",
      planId: "pro",
    };
  });

  it("creates a CCH user and default key with matching limits", async () => {
    const mockDeps = deps();

    const result = await provisionPortalSubscription(input, mockDeps);

    expect(mockDeps.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "buyer@example.com",
        rpm: 30,
        providerGroup: "portal",
        limitWeeklyUsd: 150,
        limitMonthlyUsd: 600,
        limitTotalUsd: 600,
      })
    );
    expect(mockDeps.createKey).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "default",
        key: "sk-generated",
        can_login_web_ui: true,
        limit_weekly_usd: 150,
        limit_monthly_usd: 600,
        limit_total_usd: 600,
        provider_group: "portal",
      })
    );
    expect(result.idempotent).toBe(false);
    expect(result.defaultKey.key).toBe("sk-generated");
  });

  it("returns the existing subscription without adding quota twice", async () => {
    const existingLink = link();
    const existingUser = user();
    const existingKey = key();
    const mockDeps = deps({
      findSubscriptionBySourceOrderId: vi.fn(async () => subscription()),
      findUserLinkByPortalUserId: vi.fn(async () => existingLink),
      findUserById: vi.fn(async () => existingUser),
      findKeyById: vi.fn(async () => existingKey),
    });

    const result = await provisionPortalSubscription(input, mockDeps);

    expect(mockDeps.updateUser).not.toHaveBeenCalled();
    expect(mockDeps.updateKey).not.toHaveBeenCalled();
    expect(mockDeps.createSubscription).not.toHaveBeenCalled();
    expect(result.idempotent).toBe(true);
  });

  it("returns saved subscription limits for idempotent retries", async () => {
    const existingLink = link();
    const existingUser = user({ providerGroup: "portal-saved" });
    const existingKey = key({ providerGroup: "portal-saved" });
    const mockDeps = deps({
      findPlanByPlanId: vi.fn(async () =>
        plan({
          weeklyLimitUsd: 999,
          monthlyLimitUsd: 999,
          totalLimitUsd: 999,
          rpmLimit: 99,
          providerGroup: "portal-current",
        })
      ),
      findSubscriptionBySourceOrderId: vi.fn(async () =>
        subscription({
          providerGroup: "portal-saved",
          weeklyLimitUsd: 111,
          monthlyLimitUsd: 222,
          totalLimitUsd: 333,
          rpmLimit: 44,
        })
      ),
      findUserLinkByPortalUserId: vi.fn(async () => existingLink),
      findUserById: vi.fn(async () => existingUser),
      findKeyById: vi.fn(async () => existingKey),
    });

    const result = await provisionPortalSubscription(input, mockDeps);

    expect(result.idempotent).toBe(true);
    expect(result.plan).toMatchObject({
      providerGroup: "portal-saved",
      weeklyLimitUsd: 111,
      monthlyLimitUsd: 222,
      totalLimitUsd: 333,
      rpmLimit: 44,
    });
  });

  it("rejects idempotent retries with a different plan", async () => {
    const mockDeps = deps({
      findSubscriptionBySourceOrderId: vi.fn(async () => subscription()),
    });

    await expect(
      provisionPortalSubscription({ ...input, planId: "enterprise" }, mockDeps)
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      status: 409,
    } satisfies Partial<PortalSubscriptionError>);

    expect(mockDeps.findPlanByPlanId).not.toHaveBeenCalled();
    expect(mockDeps.updateUser).not.toHaveBeenCalled();
    expect(mockDeps.updateKey).not.toHaveBeenCalled();
    expect(mockDeps.createSubscription).not.toHaveBeenCalled();
  });

  it("rejects idempotent retries with a different portal user", async () => {
    const mockDeps = deps({
      findSubscriptionBySourceOrderId: vi.fn(async () => subscription()),
    });

    await expect(
      provisionPortalSubscription({ ...input, portalUserId: "portal-user-2" }, mockDeps)
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      status: 409,
    } satisfies Partial<PortalSubscriptionError>);

    expect(mockDeps.findPlanByPlanId).not.toHaveBeenCalled();
    expect(mockDeps.createSubscription).not.toHaveBeenCalled();
  });

  it("rejects idempotent retries with a different email", async () => {
    const mockDeps = deps({
      findSubscriptionBySourceOrderId: vi.fn(async () => subscription()),
    });

    await expect(
      provisionPortalSubscription({ ...input, email: "other@example.com" }, mockDeps)
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      status: 409,
    } satisfies Partial<PortalSubscriptionError>);

    expect(mockDeps.findPlanByPlanId).not.toHaveBeenCalled();
    expect(mockDeps.createSubscription).not.toHaveBeenCalled();
  });

  it("extends time and adds only the total limit for repeat purchases", async () => {
    const existingUser = user({
      expiresAt: new Date("2026-06-01T00:00:00.000Z"),
      limitTotalUsd: 200,
    });
    const mockDeps = deps({
      findUserLinkByPortalUserId: vi.fn(async () => link()),
      findUserById: vi.fn(async () => existingUser),
      findKeyById: vi.fn(async () => key()),
    });

    await provisionPortalSubscription(input, mockDeps);

    expect(mockDeps.updateUser).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        expiresAt: new Date("2026-07-01T00:00:00.000Z"),
        limitWeeklyUsd: 150,
        limitMonthlyUsd: 600,
        limitTotalUsd: 800,
      })
    );
    expect(mockDeps.updateKey).toHaveBeenCalledWith(
      20,
      expect.objectContaining({
        expires_at: new Date("2026-07-01T00:00:00.000Z"),
        limit_weekly_usd: 150,
        limit_monthly_usd: 600,
        limit_total_usd: 800,
      })
    );
  });
});
