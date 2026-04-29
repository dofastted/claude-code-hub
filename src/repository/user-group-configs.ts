import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/drizzle/db";
import { userGroupConfigs } from "@/drizzle/schema";
import { ensureProviderGroupsExist } from "@/repository/provider-groups";
import type {
  UpsertUserGroupConfigInput,
  UserGroupConfig,
  UserGroupConfigKind,
} from "@/types/user-group-config";

type UserGroupConfigRow = typeof userGroupConfigs.$inferSelect;

function toUserGroupConfig(row: UserGroupConfigRow): UserGroupConfig {
  return {
    id: row.id,
    groupName: row.groupName,
    kind: row.kind as UserGroupConfigKind,
    temporaryKeysEnabled: row.temporaryKeysEnabled,
    portalManaged: row.portalManaged,
    description: row.description ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function findAllUserGroupConfigs(): Promise<UserGroupConfig[]> {
  const rows = await db
    .select()
    .from(userGroupConfigs)
    .orderBy(asc(userGroupConfigs.groupName));

  return rows.map(toUserGroupConfig);
}

export async function findUserGroupConfigByName(
  groupName: string
): Promise<UserGroupConfig | null> {
  const normalized = groupName.trim();
  if (!normalized) return null;

  const [row] = await db
    .select()
    .from(userGroupConfigs)
    .where(eq(userGroupConfigs.groupName, normalized))
    .limit(1);

  return row ? toUserGroupConfig(row) : null;
}

export async function upsertUserGroupConfig(
  input: UpsertUserGroupConfigInput
): Promise<UserGroupConfig> {
  const groupName = input.groupName.trim();
  if (!groupName) {
    throw new Error("groupName is required");
  }

  await ensureProviderGroupsExist([groupName]);

  const [row] = await db
    .insert(userGroupConfigs)
    .values({
      groupName,
      kind: input.kind ?? "standard",
      temporaryKeysEnabled: input.temporaryKeysEnabled ?? false,
      portalManaged: input.portalManaged ?? false,
      description: input.description ?? null,
    })
    .onConflictDoUpdate({
      target: userGroupConfigs.groupName,
      set: {
        kind: input.kind ?? "standard",
        temporaryKeysEnabled: input.temporaryKeysEnabled ?? false,
        portalManaged: input.portalManaged ?? false,
        description: input.description ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return toUserGroupConfig(row);
}

export async function ensureUserGroupConfigs(
  inputs: UpsertUserGroupConfigInput[]
): Promise<UserGroupConfig[]> {
  const result: UserGroupConfig[] = [];
  for (const input of inputs) {
    result.push(await upsertUserGroupConfig(input));
  }
  return result;
}

export async function ensureDefaultUserGroupConfigs(
  inputs: UpsertUserGroupConfigInput[]
): Promise<void> {
  const values = inputs
    .map((input) => ({
      groupName: input.groupName.trim(),
      kind: input.kind ?? "standard",
      temporaryKeysEnabled: input.temporaryKeysEnabled ?? false,
      portalManaged: input.portalManaged ?? false,
      description: input.description ?? null,
    }))
    .filter((input) => input.groupName.length > 0);

  if (values.length === 0) return;

  await ensureProviderGroupsExist(values.map((value) => value.groupName));
  await db
    .insert(userGroupConfigs)
    .values(values)
    .onConflictDoNothing({ target: userGroupConfigs.groupName });
}
