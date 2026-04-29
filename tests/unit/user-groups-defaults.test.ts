import { describe, expect, it } from "vitest";
import {
  buildDefaultUserGroupConfigs,
  DEFAULT_PORTAL_GROUP,
  DEFAULT_TEST_KEY_GROUP,
} from "@/lib/user-groups/defaults";

describe("buildDefaultUserGroupConfigs", () => {
  it("keeps built-in groups and adds env-specific groups", () => {
    const configs = buildDefaultUserGroupConfigs({
      portalGroup: "portal-custom",
      testKeyGroup: "temp-custom",
    });

    expect(configs.map((config) => config.groupName)).toEqual([
      DEFAULT_TEST_KEY_GROUP,
      DEFAULT_PORTAL_GROUP,
      "temp-custom",
      "portal-custom",
    ]);
    expect(configs.find((config) => config.groupName === "temp-custom")).toMatchObject({
      kind: "test_key",
      temporaryKeysEnabled: true,
      portalManaged: false,
    });
    expect(configs.find((config) => config.groupName === "portal-custom")).toMatchObject({
      kind: "portal",
      temporaryKeysEnabled: true,
      portalManaged: true,
    });
  });

  it("deduplicates default group names", () => {
    const configs = buildDefaultUserGroupConfigs({
      portalGroup: "portal",
      testKeyGroup: "test-key",
    });

    expect(configs.map((config) => config.groupName)).toEqual(["test-key", "portal"]);
  });
});
