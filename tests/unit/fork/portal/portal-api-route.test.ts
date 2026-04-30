import { describe, expect, it } from "vitest";
import { portalSubscriptionProvisionSchema, readLimit } from "@/fork/portal/api-route";

describe("portal API route validation", () => {
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
    expect(readLimit(new Request("http://localhost/api/portal/subscriptions?limit=abc"))).toBe(
      100
    );
  });
});
