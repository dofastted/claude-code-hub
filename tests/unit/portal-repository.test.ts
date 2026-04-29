import { describe, expect, it, vi } from "vitest";

vi.mock("@/drizzle/db", () => ({
  db: {},
}));

vi.mock("@/lib/config/env.schema", () => ({
  getEnvConfig: () => ({
    PORTAL_PROVIDER_GROUP: "portal-custom",
  }),
}));

describe("portal repository", () => {
  it("uses PORTAL_PROVIDER_GROUP as the default plan provider group", async () => {
    const { resolvePortalPlanProviderGroup } = await import("@/repository/portal");

    expect(resolvePortalPlanProviderGroup()).toBe("portal-custom");
    expect(resolvePortalPlanProviderGroup("")).toBe("portal-custom");
    expect(resolvePortalPlanProviderGroup("explicit-group")).toBe("explicit-group");
  });
});
