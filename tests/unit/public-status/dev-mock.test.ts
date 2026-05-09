import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPublicStatusDevMockEnabled,
  isPublicStatusDevMockSearchParamValue,
} from "@/lib/public-status/dev-mock";

describe("public status development mock guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires explicit mock opt-in outside production", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(isPublicStatusDevMockEnabled(new URLSearchParams("mock=1"))).toBe(true);
    expect(isPublicStatusDevMockSearchParamValue("1")).toBe(true);
    expect(isPublicStatusDevMockEnabled(new URLSearchParams("mock=true"))).toBe(false);
    expect(isPublicStatusDevMockSearchParamValue(undefined)).toBe(false);
  });

  it("ignores mock opt-in in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(isPublicStatusDevMockEnabled(new URLSearchParams("mock=1"))).toBe(false);
    expect(isPublicStatusDevMockSearchParamValue("1")).toBe(false);
  });
});
