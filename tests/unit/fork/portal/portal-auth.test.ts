import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function importAuth() {
  vi.resetModules();
  return import("@/fork/portal/auth");
}

describe("portal auth", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.NODE_ENV = "test";
    process.env.PORTAL_MANAGEMENT_TOKEN = "portal-secret";
    process.env.ADMIN_TOKEN = "admin-secret";
    process.env.PORTAL_PROVIDER_GROUP = "portal";
    process.env.PORTAL_TEST_KEY_GROUP = "test-key";
    process.env.FKCODEX_PORTAL_PLAN_READ_TOKEN = "plan-read-secret";
    process.env.FKCODEX_PORTAL_SUBSCRIPTION_READ_TOKEN = "subscription-read-secret";
    process.env.FKCODEX_PORTAL_SUBSCRIPTION_WRITE_TOKEN = "subscription-write-secret";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it("accepts the portal management token", async () => {
    const { validatePortalRequest } = await importAuth();
    const request = new Request("http://localhost/api/portal/users", {
      headers: { authorization: "Bearer portal-secret" },
    });

    expect(validatePortalRequest(request)).toEqual({
      providerGroup: "portal",
      testKeyGroup: "test-key",
      scope: "management",
    });
  });

  it("accepts purpose-specific portal tokens only for the requested scope", async () => {
    const { validatePortalRequest } = await importAuth();
    const request = new Request("http://localhost/api/portal/plans", {
      headers: { authorization: "Bearer plan-read-secret" },
    });

    expect(validatePortalRequest(request, { scopes: ["plan:read"] })).toEqual({
      providerGroup: "portal",
      testKeyGroup: "test-key",
      scope: "plan:read",
    });
    expect(validatePortalRequest(request, { scopes: ["subscription:write"] })).toBeNull();
  });

  it("does not accept ADMIN_TOKEN unless it is also configured as the portal token", async () => {
    const { validatePortalRequest } = await importAuth();
    const request = new Request("http://localhost/api/portal/users", {
      headers: { authorization: "Bearer admin-secret" },
    });

    expect(validatePortalRequest(request)).toBeNull();
  });

  it("returns null when portal token is not configured", async () => {
    delete process.env.PORTAL_MANAGEMENT_TOKEN;
    const { validatePortalRequest } = await importAuth();
    const request = new Request("http://localhost/api/portal/users", {
      headers: { authorization: "Bearer portal-secret" },
    });

    expect(validatePortalRequest(request)).toBeNull();
  });
});
