import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTemporaryKeyBatch, deleteTemporaryKeyBatch } from "@/lib/keys/temporary-key-batches";
import { ensureProviderGroupsExist } from "@/repository/provider-groups";
import {
  ensureDefaultUserGroupConfigs,
  findUserGroupConfigByName,
} from "@/repository/user-group-configs";
import { findUserById } from "@/repository/user";
import { findTemporaryKeyBatchWithKeys } from "@/repository/temporary-key-batches";

vi.mock("@/lib/config/env.schema", () => ({
  getEnvConfig: () => ({
    PORTAL_PROVIDER_GROUP: "portal-custom",
    PORTAL_TEST_KEY_GROUP: "temp-custom",
  }),
}));

vi.mock("@/repository/provider-groups", () => ({
  ensureProviderGroupsExist: vi.fn(async () => undefined),
}));

vi.mock("@/repository/user-group-configs", () => ({
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

vi.mock("@/repository/temporary-key-batches", () => ({
  createTemporaryKeyBatchWithKeys: vi.fn(async () => {
    throw new Error("createTemporaryKeyBatchWithKeys should not be called");
  }),
  findTemporaryKeyBatchWithKeys: vi.fn(async () => null),
  markTemporaryKeyBatchDeleted: vi.fn(async () => undefined),
}));

vi.mock("@/lib/user-groups/sync", () => ({
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
});
