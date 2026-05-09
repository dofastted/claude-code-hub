import { beforeEach, describe, expect, it, vi } from "vitest";

const validatePortalRequestMock = vi.fn();
const findUserListMock = vi.fn();
const findUserByIdMock = vi.fn();
const findKeyListMock = vi.fn();

vi.mock("@/fork/portal/auth", () => ({
  validatePortalRequest: validatePortalRequestMock,
}));

vi.mock("@/fork/portal/repository/user-group-configs", () => ({
  ensureDefaultUserGroupConfigs: vi.fn(async () => undefined),
}));

vi.mock("@/repository/provider-groups", () => ({
  ensureProviderGroupsExist: vi.fn(async () => undefined),
}));

vi.mock("@/repository/user", () => ({
  createUser: vi.fn(),
  findUserById: findUserByIdMock,
  findUserList: findUserListMock,
  updateUser: vi.fn(),
}));

vi.mock("@/repository/key", () => ({
  createKey: vi.fn(),
  deleteKey: vi.fn(),
  findKeyById: vi.fn(),
  findKeyList: findKeyListMock,
}));

vi.mock("@/fork/portal/repository/portal", () => ({
  findPortalSubscriptionById: vi.fn(),
  listPortalPlans: vi.fn(async () => []),
  listPortalSubscriptions: vi.fn(async () => []),
  setPortalSubscriptionStatus: vi.fn(),
}));

vi.mock("@/fork/portal/subscriptions", () => ({
  PortalSubscriptionError: class PortalSubscriptionError extends Error {},
  provisionPortalSubscription: vi.fn(),
}));

vi.mock("@/fork/portal/web-callback", () => ({
  notifyFkWebPortalEvent: vi.fn(async () => null),
}));

vi.mock("@/fork/portal/services/temporary-key-batches", () => ({
  TemporaryKeyBatchError: class TemporaryKeyBatchError extends Error {
    code;
    status;
    constructor(message: string, code = "ERROR", status = 400) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
  createTemporaryKeyBatch: vi.fn(),
  deleteTemporaryKeyBatch: vi.fn(),
  getTemporaryKeyBatchForDownload: vi.fn(),
}));

vi.mock("@/fork/portal/user-groups/defaults", () => ({
  buildDefaultUserGroupConfigs: vi.fn(() => []),
}));

vi.mock("@/fork/portal/user-groups/sync", () => ({
  syncUserProviderGroupFromKeysForSystem: vi.fn(async () => undefined),
}));

const { GET, portalSubscriptionProvisionSchema, readLimit } = await import(
  "@/fork/portal/api-route"
);

describe("portal API route validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validatePortalRequestMock.mockReturnValue({
      scope: "management",
      providerGroup: "portal",
      testKeyGroup: "test-key",
    });
  });

  it("rejects unsafe portal subscription identifiers", () => {
    for (const partial of [
      { sourceOrderId: "order/unsafe" },
      { portalUserId: "portal user space" },
      { planId: "pro/unsafe" },
      { sourceOrderId: "o".repeat(201) },
      { planId: "p".repeat(101) },
    ]) {
      const result = portalSubscriptionProvisionSchema.safeParse({
        sourceOrderId: "order-1",
        portalUserId: "portal-user-1",
        email: "buyer@example.com",
        planId: "pro",
        ...partial,
      });
      expect(result.success).toBe(false);
    }
  });

  it("accepts safe portal subscription identifiers and bounded text fields", () => {
    const result = portalSubscriptionProvisionSchema.safeParse({
      sourceOrderId: "order_1.2:3-4",
      portalUserId: "portal-user_1.2:3",
      email: "buyer@example.com",
      planId: "pro.local:1",
      assignedSource: "fk-web-glm-local",
      notes: "local smoke",
    });

    expect(result.success).toBe(true);
  });

  it("caps portal subscription list limit at 500 and defaults invalid values", () => {
    expect(readLimit(new Request("http://localhost/api/portal/subscriptions?limit=1000"))).toBe(
      500
    );
    expect(readLimit(new Request("http://localhost/api/portal/subscriptions?limit=-1"))).toBe(100);
    expect(readLimit(new Request("http://localhost/api/portal/subscriptions?limit=abc"))).toBe(100);
  });

  it("puts temporary-key users first in portal user list", async () => {
    findUserListMock.mockResolvedValueOnce([
      {
        id: 20,
        name: "normal-user",
        description: "",
        role: "user",
        rpm: null,
        dailyQuota: null,
        providerGroup: "portal",
        tags: [],
        createdAt: new Date("2026-05-01T00:00:00Z"),
        updatedAt: new Date("2026-05-01T00:00:00Z"),
        limit5hResetMode: "rolling",
        dailyResetMode: "fixed",
        dailyResetTime: "00:00",
        isEnabled: true,
        allowedClients: [],
        blockedClients: [],
        allowedModels: [],
      },
      {
        id: 10,
        name: "temp-user",
        description: "",
        role: "user",
        rpm: null,
        dailyQuota: null,
        providerGroup: "test-key",
        tags: [],
        createdAt: new Date("2026-05-01T00:00:00Z"),
        updatedAt: new Date("2026-05-01T00:00:00Z"),
        limit5hResetMode: "rolling",
        dailyResetMode: "fixed",
        dailyResetTime: "00:00",
        isEnabled: true,
        allowedClients: [],
        blockedClients: [],
        allowedModels: [],
      },
    ]);

    const response = await GET(new Request("http://localhost/api/portal/users"), {
      params: Promise.resolve({ route: ["users"] }),
    });
    const payload = await response.json();

    expect(payload.data.map((user: { id: number }) => user.id)).toEqual([10, 20]);
  });

  it("puts temporary keys first in portal key list", async () => {
    findUserByIdMock.mockResolvedValueOnce({
      id: 5,
      name: "portal-user",
      description: "",
      role: "user",
      rpm: null,
      dailyQuota: null,
      providerGroup: "portal,test-key",
      tags: [],
      createdAt: new Date("2026-05-01T00:00:00Z"),
      updatedAt: new Date("2026-05-01T00:00:00Z"),
      limit5hResetMode: "rolling",
      dailyResetMode: "fixed",
      dailyResetTime: "00:00",
      isEnabled: true,
      allowedClients: [],
      blockedClients: [],
      allowedModels: [],
    });
    findKeyListMock.mockResolvedValueOnce([
      {
        id: 101,
        userId: 5,
        name: "normal-key",
        key: "sk-normal",
        isEnabled: true,
        canLoginWebUi: false,
        limit5hUsd: null,
        limit5hResetMode: "rolling",
        limitDailyUsd: null,
        dailyResetMode: "fixed",
        dailyResetTime: "00:00",
        limitWeeklyUsd: null,
        limitMonthlyUsd: null,
        limitTotalUsd: null,
        limitConcurrentSessions: 0,
        providerGroup: "portal",
        cacheTtlPreference: null,
        createdAt: new Date("2026-05-01T01:00:00Z"),
        updatedAt: new Date("2026-05-01T01:00:00Z"),
      },
      {
        id: 102,
        userId: 5,
        name: "temp-key",
        key: "sk-temp",
        isEnabled: true,
        canLoginWebUi: false,
        limit5hUsd: null,
        limit5hResetMode: "rolling",
        limitDailyUsd: null,
        dailyResetMode: "fixed",
        dailyResetTime: "00:00",
        limitWeeklyUsd: null,
        limitMonthlyUsd: null,
        limitTotalUsd: null,
        limitConcurrentSessions: 0,
        providerGroup: "test-key",
        cacheTtlPreference: null,
        createdAt: new Date("2026-05-01T02:00:00Z"),
        updatedAt: new Date("2026-05-01T02:00:00Z"),
      },
    ]);

    const response = await GET(new Request("http://localhost/api/portal/users/5/keys"), {
      params: Promise.resolve({ route: ["users", "5", "keys"] }),
    });
    const payload = await response.json();

    expect(payload.data.map((key: { id: number }) => key.id)).toEqual([102, 101]);
  });
});
