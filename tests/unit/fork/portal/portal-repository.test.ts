import { describe, expect, it, vi } from "vitest";

vi.mock("@/drizzle/db", () => ({
  db: {},
}));

vi.mock("@/fork/portal/config", () => ({
  getPortalConfig: () => ({
    PORTAL_PROVIDER_GROUP: "portal-custom",
  }),
}));

describe("portal repository", () => {
  it("uses PORTAL_PROVIDER_GROUP as the default plan provider group", async () => {
    const { resolvePortalPlanProviderGroup } = await import("@/fork/portal/repository/portal");

    expect(resolvePortalPlanProviderGroup()).toBe("portal-custom");
    expect(resolvePortalPlanProviderGroup("")).toBe("portal-custom");
    expect(resolvePortalPlanProviderGroup("explicit-group")).toBe("explicit-group");
  });
});
