import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const envPath = resolve(repoRoot, ".env.local");

if (existsSync(envPath)) {
  const { default: dotenv } = await import("dotenv");
  dotenv.config({ path: envPath, quiet: true });
}

const PROVIDER_GROUP_DEFAULT = "default";

function fail(message) {
  throw new Error(`[portal:key-sync] ${message}`);
}

function splitProviderGroups(value) {
  if (typeof value !== "string") return [];
  return value
    .split(/[,，\n\r]+/)
    .map((group) => group.trim())
    .filter(Boolean);
}

function normalizeProviderGroup(value) {
  const groups = splitProviderGroups(value);
  if (groups.length === 0) return PROVIDER_GROUP_DEFAULT;
  return Array.from(new Set(groups)).sort().join(",");
}

function parseDsn(value) {
  try {
    return new URL(value);
  } catch (error) {
    fail(`DSN 无效: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function resolveDsn() {
  const dsn = process.env.DSN || process.env.DATABASE_URL;
  if (!dsn) {
    fail("缺少 DSN 或 DATABASE_URL。");
  }

  const parsed = parseDsn(dsn);
  return {
    dsn,
    host: parsed.hostname || "(unknown)",
    database: parsed.pathname.replace(/^\//, "") || "(default)",
  };
}

function buildMergedProviderGroup(keyGroups) {
  const merged = new Set();
  for (const value of keyGroups) {
    for (const group of splitProviderGroups(value)) {
      merged.add(group);
    }
  }
  return merged.size > 0 ? Array.from(merged).sort().join(",") : PROVIDER_GROUP_DEFAULT;
}

export async function run(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  const dryRun = args.has("--dry-run");
  const includeAdmins = args.has("--include-admins");
  const { dsn, host, database } = resolveDsn();
  const sql = postgres(dsn, { max: 1 });
  const lines = [];

  const log = (line) => {
    lines.push(line);
    console.log(line);
  };

  try {
    const users = await sql`
      SELECT
        u.id,
        u.name,
        u.role,
        u.provider_group,
        COALESCE(
          ARRAY_AGG(k.provider_group ORDER BY k.created_at, k.id)
            FILTER (WHERE k.deleted_at IS NULL),
          ARRAY[]::text[]
        ) AS key_groups
      FROM users u
      LEFT JOIN keys k
        ON k.user_id = u.id
       AND k.deleted_at IS NULL
      WHERE u.deleted_at IS NULL
        AND (${includeAdmins}::boolean OR u.role <> 'admin')
      GROUP BY u.id, u.name, u.role, u.provider_group
      ORDER BY u.id
    `;

    const updates = users
      .map((user) => {
        const nextGroup = buildMergedProviderGroup(user.key_groups ?? []);
        const currentGroup = normalizeProviderGroup(user.provider_group);
        return {
          id: user.id,
          name: user.name,
          role: user.role,
          currentGroup,
          nextGroup,
        };
      })
      .filter((item) => item.currentGroup !== item.nextGroup);

    log(
      `[portal:key-sync] 扫描完成 host=${host} db=${database} users=${users.length} pending=${updates.length} dryRun=${dryRun}`
    );

    if (updates.length === 0) {
      return { exitCode: 0, lines };
    }

    for (const item of updates) {
      log(
        `[portal:key-sync] user=${item.id} role=${item.role} name=${item.name} provider_group: ${item.currentGroup} -> ${item.nextGroup}`
      );
    }

    if (dryRun) {
      return { exitCode: 0, lines };
    }

    await sql.begin(async (tx) => {
      for (const item of updates) {
        await tx`
          UPDATE users
          SET provider_group = ${item.nextGroup},
              updated_at = now()
          WHERE id = ${item.id}
        `;
      }
    });

    log(`[portal:key-sync] 已更新 ${updates.length} 个用户。`);
    return { exitCode: 0, lines };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
