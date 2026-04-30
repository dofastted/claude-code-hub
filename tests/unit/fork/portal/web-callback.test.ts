import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function importCallback() {
  vi.resetModules();
  return import("@/fork/portal/web-callback");
}

describe("portal web callback", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.NODE_ENV = "test";
    process.env.FK_WEB_PORTAL_CALLBACK_URL = "http://127.0.0.1:3301/api/cch/portal/callback";
    process.env.FK_WEB_PORTAL_CALLBACK_TOKEN = "callback-token";
    process.env.FK_WEB_PORTAL_CALLBACK_SIGNING_SECRET = "fixture-secret";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.resetModules();
  });

  it("uses the expected HMAC fixture", async () => {
    const { signFkWebPortalCallbackBody } = await importCallback();
    const body = JSON.stringify({
      event: "portal.subscription.provisioned",
      data: {
        result: {
          subscription: {
            sourceOrderId: "order-1",
            portalUserId: "portal-user-1",
            planId: "pro",
          },
        },
      },
    });

    expect(signFkWebPortalCallbackBody("fixture-secret", "1760000000000", body)).toBe(
      "sha256=bf0e9229f45802456e8d895aa42abc12df56a761f9be354f7fd9a8f9e82d91ec"
    );
  });

  it("sends signed callback headers to fk-web-glm", async () => {
    vi.setSystemTime(new Date("2026-04-29T00:00:00.000Z"));
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { notifyFkWebPortalEvent, signFkWebPortalCallbackBody } = await importCallback();

    const result = await notifyFkWebPortalEvent("portal.subscription.provisioned", {
      result: {
        subscription: {
          sourceOrderId: "order-1",
          portalUserId: "portal-user-1",
          planId: "pro",
        },
      },
    });

    expect(result).toEqual({ skipped: false, ok: true, status: 200, error: undefined });
    const [, init] = fetchMock.mock.calls[0];
    const body = String(init?.body);
    const timestamp = String(new Date("2026-04-29T00:00:00.000Z").getTime());
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer callback-token",
      "X-FK-Portal-Timestamp": timestamp,
      "X-FK-Portal-Signature": signFkWebPortalCallbackBody("fixture-secret", timestamp, body),
    });
  });

  it("does not call fk-web-glm when the signing secret is missing", async () => {
    delete process.env.FK_WEB_PORTAL_CALLBACK_SIGNING_SECRET;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { notifyFkWebPortalEvent } = await importCallback();

    const result = await notifyFkWebPortalEvent("portal.subscription.revoked", {
      subscription: { id: 10, status: "revoked" },
    });

    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(false);
    expect(result.error).toContain("FK_WEB_PORTAL_CALLBACK_SIGNING_SECRET");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
