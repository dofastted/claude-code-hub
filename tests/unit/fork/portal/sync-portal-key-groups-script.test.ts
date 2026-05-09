import { beforeEach, describe, expect, it, vi } from "vitest";

const fakeSql = vi.hoisted(() => {
  const tag = vi.fn();
  tag.begin = vi.fn();
  tag.end = vi.fn(async () => undefined);
  return tag;
});

const postgresFactory = vi.hoisted(() => vi.fn(() => fakeSql));

vi.mock("postgres", () => ({
  default: postgresFactory,
}));

describe("scripts/fork/sync-portal-key-groups.mjs", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("DSN", "postgres://postgres:postgres@127.0.0.1:5432/claude_code_hub");
  });

  it("reports pending updates in dry-run mode without writing", async () => {
    fakeSql.mockResolvedValueOnce([
      {
        id: 7,
        name: "temp-user",
        role: "user",
        provider_group: "portal",
        key_groups: ["test-key", "portal"],
      },
      {
        id: 8,
        name: "same-user",
        role: "user",
        provider_group: "portal,test-key",
        key_groups: ["portal", "test-key"],
      },
    ]);

    const script = await import("../../../../scripts/fork/sync-portal-key-groups.mjs");
    const result = await script.run(["--dry-run"]);

    expect(result.exitCode).toBe(0);
    expect(result.lines.join("\n")).toContain("pending=1");
    expect(result.lines.join("\n")).toContain("user=7");
    expect(fakeSql.begin).not.toHaveBeenCalled();
    expect(fakeSql.end).toHaveBeenCalled();
  });

  it("updates mismatched users when not in dry-run mode", async () => {
    fakeSql.mockResolvedValueOnce([
      {
        id: 7,
        name: "temp-user",
        role: "user",
        provider_group: "portal",
        key_groups: ["test-key", "portal"],
      },
    ]);

    const tx = vi.fn(async () => []);
    fakeSql.begin.mockImplementationOnce(async (callback) => callback(tx));

    const script = await import("../../../../scripts/fork/sync-portal-key-groups.mjs");
    const result = await script.run([]);

    expect(result.exitCode).toBe(0);
    expect(fakeSql.begin).toHaveBeenCalledTimes(1);
    expect(tx).toHaveBeenCalledTimes(1);
    expect(tx.mock.calls[0][0]).toBeTruthy();
    expect(result.lines.join("\n")).toContain("已更新 1 个用户");
  });
});
