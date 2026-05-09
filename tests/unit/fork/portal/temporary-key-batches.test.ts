import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTemporaryKeyBatch,
  deleteTemporaryKeyBatch,
} from "@/fork/portal/services/temporary-key-batches";
import { ensureProviderGroupsExist } from "@/repository/provider-groups";
import {
  ensureDefaultUserGroupConfigs,
  findUserGroupConfigByName,
} from "@/fork/portal/repository/user-group-configs";
import { findUserById } from "@/repository/user";
import { findTemporaryKeyBatchWithKeys } from "@/fork/portal/repository/temporary-key-batches";
import { deleteKey, findKeyList } from "@/repository/key";
import { syncUserProviderGroupFromKeysForSystem } from "@/fork/portal/user-groups/sync";

vi.mock("@/fork/portal/config", () => ({
  getPortalConfig: () => ({
    PORTAL_PROVIDER_GROUP: "portal-custom",
    PORTAL_TEST_KEY_GROUP: "temp-custom",
  }),
}));

vi.mock("@/repository/provider-groups", () => ({
  ensureProviderGroupsExist: vi.fn(async () => undefined),
}));

vi.mock("@/fork/portal/repository/user-group-configs", () => ({
  ensureDefaultUserGroupConfigs: vi.fn(async () => undefined),
  findUserGroupConfigByName: vi.fn(async (groupName: string) => ({
    id: 1,
    groupName,
    kind: groupName === "portal-custom" ? "portal" : "test_key",
    temporaryKeysEnabled: true,
    portalManaged: groupName === "portal-custom",
    description: null,
    createdAt: new Date("2026-04-28T00:00:00.000Z"),
    updatedAt: new Date("2026-04-28T00:00:00.000Z"),
  })),
}));

vi.mock("@/repository/user", () => ({
  findUserById: vi.fn(async () => null),
}));

vi.mock("@/repository/key", () => ({
  deleteKey: vi.fn(async () => true),
  findKeyById: vi.fn(async () => null),
  findKeyList: vi.fn(async () => []),
}));

vi.mock("@/fork/portal/repository/temporary-key-batches", () => ({
  createTemporaryKeyBatchWithKeys: vi.fn(async () => {
    throw new Error("createTemporaryKeyBatchWithKeys should not be called");
  }),
  findTemporaryKeyBatchWithKeys: vi.fn(async () => null),
  markTemporaryKeyBatchDeleted: vi.fn(async () => undefined),
}));

vi.mock("@/fork/portal/user-groups/sync", () => ({
  syncUserProviderGroupFromKeysForSystem: vi.fn(async () => undefined),
}));

describe("temporary key batches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("seeds the env-specific test key group before creating a batch", async () => {
    await expect(
      createTemporaryKeyBatch({
        providerGroup: "temp-custom",
        sourceUserId: 1,
        sourceKeyId: 2,
        count: 1,
      })
    ).rejects.toMatchObject({ code: "USER_NOT_FOUND" });

    expect(ensureDefaultUserGroupConfigs).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ groupName: "temp-custom", temporaryKeysEnabled: true }),
        expect.objectContaining({ groupName: "portal-custom", temporaryKeysEnabled: true }),
      ])
    );
    expect(ensureProviderGroupsExist).toHaveBeenCalledWith(["temp-custom"]);
    expect(findUserGroupConfigByName).toHaveBeenCalledWith("temp-custom");
    expect(findUserById).toHaveBeenCalledWith(1);
  });

  it("seeds the env-specific portal group before deleting a batch", async () => {
    await expect(
      deleteTemporaryKeyBatch({ batchId: 1, providerGroup: "portal-custom" })
    ).rejects.toMatchObject({
      code: "BATCH_NOT_FOUND",
    });

    expect(ensureDefaultUserGroupConfigs).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ groupName: "temp-custom", temporaryKeysEnabled: true }),
        expect.objectContaining({ groupName: "portal-custom", temporaryKeysEnabled: true }),
      ])
    );
    expect(ensureProviderGroupsExist).toHaveBeenCalledWith(["portal-custom"]);
    expect(findUserGroupConfigByName).toHaveBeenCalledWith("portal-custom");
    expect(findTemporaryKeyBatchWithKeys).toHaveBeenCalledWith(1);
  });

  it("deletes a temporary batch even when it contains the source user's last active key", async () => {
    vi.mocked(findTemporaryKeyBatchWithKeys).mockResolvedValueOnce({
      id: 9,
      providerGroup: "temp-custom",
      name: "one-off-test",
      sourceUserId: 7,
      sourceKeyId: 70,
      createdCount: 1,
      createdByUserId: null,
      deletedAt: null,
      createdAt: new Date("2026-04-28T00:00:00.000Z"),
      updatedAt: new Date("2026-04-28T00:00:00.000Z"),
      keys: [
        {
          id: 70,
          userId: 7,
          name: "temporary-001",
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
          limitTotalUsd: 3,
          limitConcurrentSessions: 0,
          providerGroup: "temp-custom",
          cacheTtlPreference: null,
          createdAt: new Date("2026-04-28T00:00:00.000Z"),
          updatedAt: new Date("2026-04-28T00:00:00.000Z"),
        },
      ],
    });
    vi.mocked(findKeyList).mockResolvedValueOnce([]);

    const result = await deleteTemporaryKeyBatch({ batchId: 9, providerGroup: "temp-custom" });

    expect(result).toEqual({
      batchId: 9,
      deletedKeyIds: [70],
      affectedUserIds: [7],
    });
    expect(deleteKey).toHaveBeenCalledWith(70);
    expect(syncUserProviderGroupFromKeysForSystem).toHaveBeenCalledWith(7);
    expect(findKeyList).not.toHaveBeenCalled();
  });
});
