import { randomBytes } from "node:crypto";
import { z } from "zod";
import { type PortalAccessScope, validatePortalRequest } from "@/fork/portal/auth";
import {
  findPortalSubscriptionById,
  listPortalPlans as listPortalPlansRepository,
  listPortalSubscriptions as listPortalSubscriptionsRepository,
  setPortalSubscriptionStatus,
} from "@/fork/portal/repository/portal";
import { ensureDefaultUserGroupConfigs } from "@/fork/portal/repository/user-group-configs";
import {
  serializePortalPlan,
  serializePortalProvisionResult,
  serializePortalSubscription,
} from "@/fork/portal/serialization";
import {
  createTemporaryKeyBatch,
  deleteTemporaryKeyBatch,
  getTemporaryKeyBatchForDownload,
  TemporaryKeyBatchError,
} from "@/fork/portal/services/temporary-key-batches";
import { PortalSubscriptionError, provisionPortalSubscription } from "@/fork/portal/subscriptions";
import { buildDefaultUserGroupConfigs } from "@/fork/portal/user-groups/defaults";
import { syncUserProviderGroupFromKeysForSystem } from "@/fork/portal/user-groups/sync";
import { notifyFkWebPortalEvent } from "@/fork/portal/web-callback";
import { normalizeProviderGroup, parseProviderGroups } from "@/lib/utils/provider-group";
import { createKey, deleteKey, findKeyById, findKeyList } from "@/repository/key";
import { ensureProviderGroupsExist } from "@/repository/provider-groups";
import { createUser, findUserById, findUserList, updateUser } from "@/repository/user";
import type { Key } from "@/types/key";
import type { User } from "@/types/user";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ route?: string[] }> };
type PortalContext = NonNullable<ReturnType<typeof validatePortalRequest>>;

const nullableNumberSchema = z.number().finite().nullable().optional();
const dateStringSchema = z.string().datetime().nullable().optional();
const portalSafeIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/);
const portalPlanIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._:-]+$/);

const portalUserCreateSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional().default(""),
    providerGroup: z.string().max(200).optional(),
    rpm: nullableNumberSchema,
    dailyQuota: nullableNumberSchema,
    limit5hUsd: nullableNumberSchema,
    limitWeeklyUsd: nullableNumberSchema,
    limitMonthlyUsd: nullableNumberSchema,
    limitTotalUsd: nullableNumberSchema,
    limitConcurrentSessions: z.number().int().nonnegative().nullable().optional(),
    isEnabled: z.boolean().optional(),
    expiresAt: dateStringSchema,
    tags: z.array(z.string().max(100)).optional(),
    allowedClients: z.array(z.string().max(200)).optional(),
    blockedClients: z.array(z.string().max(200)).optional(),
    allowedModels: z.array(z.string().max(200)).optional(),
  })
  .strict();

const portalUserUpdateSchema = portalUserCreateSchema.partial().extend({
  providerGroup: z.string().max(200).optional(),
});

const portalKeyCreateSchema = z
  .object({
    name: z.string().min(1).max(200),
    isEnabled: z.boolean().optional(),
    expiresAt: dateStringSchema,
    canLoginWebUi: z.boolean().optional(),
    limit5hUsd: nullableNumberSchema,
    limit5hResetMode: z.enum(["fixed", "rolling"]).optional(),
    limitDailyUsd: nullableNumberSchema,
    dailyResetMode: z.enum(["fixed", "rolling"]).optional(),
    dailyResetTime: z
      .string()
      .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .optional(),
    limitWeeklyUsd: nullableNumberSchema,
    limitMonthlyUsd: nullableNumberSchema,
    limitTotalUsd: nullableNumberSchema,
    limitConcurrentSessions: z.number().int().nonnegative().optional(),
    providerGroup: z.string().max(200).optional(),
    cacheTtlPreference: z.enum(["inherit", "5m", "1h"]).optional(),
  })
  .strict();

const portalKeyUpdateSchema = portalKeyCreateSchema.partial();

const temporaryBatchCreateSchema = z
  .object({
    providerGroup: z.string().max(200).optional(),
    sourceUserId: z.number().int().positive(),
    sourceKeyId: z.number().int().positive(),
    count: z.number().int().min(1).max(500),
    name: z.string().min(1).max(200).optional(),
    customLimitTotalUsd: nullableNumberSchema,
  })
  .strict();

export const portalSubscriptionProvisionSchema = z
  .object({
    sourceOrderId: portalSafeIdSchema,
    portalUserId: portalSafeIdSchema,
    email: z.string().email().max(320),
    planId: portalPlanIdSchema,
    assignedSource: z.string().max(100).optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict();

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function errorJson(message: string, status: number, code = "ERROR"): Response {
  return json({ ok: false, error: message, errorCode: code }, status);
}

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function parseDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return new Date(value);
}

function groupContainsAllowedPortalGroup(
  value: string | null | undefined,
  ctx: PortalContext
): boolean {
  const groups = parseProviderGroups(normalizeProviderGroup(value));
  return groups.includes(ctx.providerGroup) || groups.includes(ctx.testKeyGroup);
}

function ensurePortalUser(user: User | null, ctx: PortalContext): User {
  if (!user || !groupContainsAllowedPortalGroup(user.providerGroup, ctx)) {
    throw errorJson("Not Found", 404, "NOT_FOUND");
  }
  return user;
}

function ensurePortalKey(key: Key | null, userId: number, ctx: PortalContext): Key {
  if (!key || key.userId !== userId || !groupContainsAllowedPortalGroup(key.providerGroup, ctx)) {
    throw errorJson("Not Found", 404, "NOT_FOUND");
  }
  return key;
}

function serializeUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    description: user.description,
    role: user.role,
    providerGroup: user.providerGroup,
    tags: user.tags ?? [],
    rpm: user.rpm,
    dailyQuota: user.dailyQuota,
    limit5hUsd: user.limit5hUsd ?? null,
    limitWeeklyUsd: user.limitWeeklyUsd ?? null,
    limitMonthlyUsd: user.limitMonthlyUsd ?? null,
    limitTotalUsd: user.limitTotalUsd ?? null,
    limitConcurrentSessions: user.limitConcurrentSessions ?? null,
    isEnabled: user.isEnabled,
    expiresAt: user.expiresAt ?? null,
    allowedClients: user.allowedClients ?? [],
    blockedClients: user.blockedClients ?? [],
    allowedModels: user.allowedModels ?? [],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function serializeKey(key: Key, options?: { includeFullKey?: boolean }) {
  return {
    id: key.id,
    userId: key.userId,
    name: key.name,
    key: options?.includeFullKey ? key.key : undefined,
    isEnabled: key.isEnabled,
    expiresAt: key.expiresAt ?? null,
    canLoginWebUi: key.canLoginWebUi,
    limit5hUsd: key.limit5hUsd,
    limit5hResetMode: key.limit5hResetMode,
    limitDailyUsd: key.limitDailyUsd,
    dailyResetMode: key.dailyResetMode,
    dailyResetTime: key.dailyResetTime,
    limitWeeklyUsd: key.limitWeeklyUsd,
    limitMonthlyUsd: key.limitMonthlyUsd,
    limitTotalUsd: key.limitTotalUsd ?? null,
    limitConcurrentSessions: key.limitConcurrentSessions,
    providerGroup: key.providerGroup,
    cacheTtlPreference: key.cacheTtlPreference,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt,
  };
}

function isTemporaryPortalGroup(
  value: string | null | undefined,
  ctx: Pick<PortalContext, "testKeyGroup">
): boolean {
  return parseProviderGroups(normalizeProviderGroup(value)).includes(ctx.testKeyGroup);
}

function sortPortalUsers(users: User[], ctx: PortalContext): User[] {
  return [...users].sort((a, b) => {
    const aTemporary = isTemporaryPortalGroup(a.providerGroup, ctx);
    const bTemporary = isTemporaryPortalGroup(b.providerGroup, ctx);
    if (aTemporary !== bTemporary) {
      return aTemporary ? -1 : 1;
    }

    return a.id - b.id;
  });
}

function sortPortalKeys(keys: Key[], ctx: PortalContext): Key[] {
  return [...keys].sort((a, b) => {
    const aTemporary = isTemporaryPortalGroup(a.providerGroup, ctx);
    const bTemporary = isTemporaryPortalGroup(b.providerGroup, ctx);
    if (aTemporary !== bTemporary) {
      return aTemporary ? -1 : 1;
    }

    if (a.createdAt.getTime() !== b.createdAt.getTime()) {
      return a.createdAt.getTime() - b.createdAt.getTime();
    }

    return a.id - b.id;
  });
}

async function ensurePortalDefaults(ctx: PortalContext): Promise<void> {
  await ensureDefaultUserGroupConfigs(
    buildDefaultUserGroupConfigs({
      portalGroup: ctx.providerGroup,
      testKeyGroup: ctx.testKeyGroup,
    })
  );
  await ensureProviderGroupsExist([ctx.providerGroup, ctx.testKeyGroup]);
}

function ensureTemporaryGroupAllowed(providerGroup: string, ctx: PortalContext): void {
  const normalized = normalizeProviderGroup(providerGroup);
  if (normalized !== ctx.providerGroup && normalized !== ctx.testKeyGroup) {
    throw new TemporaryKeyBatchError("门户 API 不允许操作该分组", "GROUP_NOT_ALLOWED", 403);
  }
}

function resolvePortalManagedGroup(value: string | undefined, ctx: PortalContext): string {
  const providerGroup = normalizeProviderGroup(value ?? ctx.providerGroup);
  ensureTemporaryGroupAllowed(providerGroup, ctx);
  return providerGroup;
}

async function listPortalUsers(ctx: PortalContext): Promise<Response> {
  await ensurePortalDefaults(ctx);
  const users = await findUserList(5000, 0);
  const portalUsers = sortPortalUsers(
    users.filter((user) => groupContainsAllowedPortalGroup(user.providerGroup, ctx)),
    ctx
  );
  return json({
    ok: true,
    data: portalUsers.map(serializeUser),
  });
}

async function createPortalUser(request: Request, ctx: PortalContext): Promise<Response> {
  await ensurePortalDefaults(ctx);
  const body = portalUserCreateSchema.parse(await readJson(request));
  const providerGroup = resolvePortalManagedGroup(body.providerGroup, ctx);
  const user = await createUser({
    name: body.name,
    description: body.description,
    rpm: body.rpm,
    dailyQuota: body.dailyQuota,
    providerGroup,
    tags: body.tags,
    limit5hUsd: body.limit5hUsd ?? undefined,
    limitWeeklyUsd: body.limitWeeklyUsd ?? undefined,
    limitMonthlyUsd: body.limitMonthlyUsd ?? undefined,
    limitTotalUsd: body.limitTotalUsd,
    limitConcurrentSessions: body.limitConcurrentSessions ?? undefined,
    isEnabled: body.isEnabled ?? true,
    expiresAt: parseDate(body.expiresAt),
    allowedClients: body.allowedClients,
    blockedClients: body.blockedClients,
    allowedModels: body.allowedModels,
  });

  return json({ ok: true, data: serializeUser(user) }, 201);
}

async function updatePortalUser(
  request: Request,
  userId: number,
  ctx: PortalContext
): Promise<Response> {
  await ensurePortalDefaults(ctx);
  const user = ensurePortalUser(await findUserById(userId), ctx);
  const body = portalUserUpdateSchema.parse(await readJson(request));
  if (
    body.providerGroup !== undefined &&
    !groupContainsAllowedPortalGroup(body.providerGroup, ctx)
  ) {
    return errorJson("门户 API 不能修改为未允许的用户分组", 403, "PROVIDER_GROUP_FORBIDDEN");
  }

  const updated = await updateUser(user.id, {
    name: body.name,
    description: body.description,
    rpm: body.rpm,
    dailyQuota: body.dailyQuota,
    providerGroup:
      body.providerGroup !== undefined ? normalizeProviderGroup(body.providerGroup) : undefined,
    tags: body.tags,
    limit5hUsd: body.limit5hUsd,
    limitWeeklyUsd: body.limitWeeklyUsd,
    limitMonthlyUsd: body.limitMonthlyUsd,
    limitTotalUsd: body.limitTotalUsd,
    limitConcurrentSessions: body.limitConcurrentSessions,
    isEnabled: body.isEnabled,
    expiresAt: parseDate(body.expiresAt),
    allowedClients: body.allowedClients,
    blockedClients: body.blockedClients,
    allowedModels: body.allowedModels,
  });

  return json({ ok: true, data: serializeUser(ensurePortalUser(updated, ctx)) });
}

async function listPortalKeys(userId: number, ctx: PortalContext): Promise<Response> {
  const user = ensurePortalUser(await findUserById(userId), ctx);
  const keys = await findKeyList(user.id);
  const portalKeys = sortPortalKeys(
    keys.filter((key) => groupContainsAllowedPortalGroup(key.providerGroup, ctx)),
    ctx
  );
  return json({
    ok: true,
    data: portalKeys.map((key) => serializeKey(key)),
  });
}

async function createPortalKey(
  request: Request,
  userId: number,
  ctx: PortalContext
): Promise<Response> {
  const user = ensurePortalUser(await findUserById(userId), ctx);
  const body = portalKeyCreateSchema.parse(await readJson(request));
  const providerGroup = resolvePortalManagedGroup(
    body.providerGroup ?? user.providerGroup ?? undefined,
    ctx
  );
  const generatedKey = `sk-${randomBytes(16).toString("hex")}`;
  const key = await createKey({
    user_id: user.id,
    name: body.name,
    key: generatedKey,
    is_enabled: body.isEnabled ?? true,
    expires_at: parseDate(body.expiresAt),
    can_login_web_ui: body.canLoginWebUi ?? false,
    limit_5h_usd: body.limit5hUsd,
    limit_5h_reset_mode: body.limit5hResetMode,
    limit_daily_usd: body.limitDailyUsd,
    daily_reset_mode: body.dailyResetMode,
    daily_reset_time: body.dailyResetTime,
    limit_weekly_usd: body.limitWeeklyUsd,
    limit_monthly_usd: body.limitMonthlyUsd,
    limit_total_usd: body.limitTotalUsd,
    limit_concurrent_sessions: body.limitConcurrentSessions,
    provider_group: providerGroup,
    cache_ttl_preference: body.cacheTtlPreference,
  });
  await syncUserProviderGroupFromKeysForSystem(user.id);

  return json({ ok: true, data: serializeKey(key, { includeFullKey: true }) }, 201);
}

async function updatePortalKey(
  request: Request,
  userId: number,
  keyId: number,
  ctx: PortalContext
): Promise<Response> {
  const user = ensurePortalUser(await findUserById(userId), ctx);
  const key = ensurePortalKey(await findKeyById(keyId), user.id, ctx);
  const body = portalKeyUpdateSchema.parse(await readJson(request));
  if (body.providerGroup !== undefined) {
    ensureTemporaryGroupAllowed(body.providerGroup, ctx);
  }
  const updated = await import("@/repository/key").then((repo) =>
    repo.updateKey(key.id, {
      name: body.name,
      is_enabled: body.isEnabled,
      expires_at: parseDate(body.expiresAt),
      can_login_web_ui: body.canLoginWebUi,
      limit_5h_usd: body.limit5hUsd,
      limit_5h_reset_mode: body.limit5hResetMode,
      limit_daily_usd: body.limitDailyUsd,
      daily_reset_mode: body.dailyResetMode,
      daily_reset_time: body.dailyResetTime,
      limit_weekly_usd: body.limitWeeklyUsd,
      limit_monthly_usd: body.limitMonthlyUsd,
      limit_total_usd: body.limitTotalUsd,
      limit_concurrent_sessions: body.limitConcurrentSessions,
      provider_group:
        body.providerGroup !== undefined ? normalizeProviderGroup(body.providerGroup) : undefined,
      cache_ttl_preference: body.cacheTtlPreference,
    })
  );

  return json({ ok: true, data: serializeKey(ensurePortalKey(updated, user.id, ctx)) });
}

async function deletePortalKey(
  userId: number,
  keyId: number,
  ctx: PortalContext
): Promise<Response> {
  const user = ensurePortalUser(await findUserById(userId), ctx);
  const key = ensurePortalKey(await findKeyById(keyId), user.id, ctx);
  if (key.isEnabled) {
    const activeKeys = (await findKeyList(user.id)).filter((item) => item.isEnabled);
    if (activeKeys.length <= 1) {
      return errorJson("该用户至少需要保留一个可用 key", 409, "LAST_ACTIVE_KEY");
    }
  }

  await deleteKey(key.id);
  await syncUserProviderGroupFromKeysForSystem(user.id);
  return json({ ok: true, data: { deletedKeyId: key.id } });
}

async function createPortalTemporaryBatch(request: Request, ctx: PortalContext): Promise<Response> {
  const body = temporaryBatchCreateSchema.parse(await readJson(request));
  const providerGroup = body.providerGroup ?? ctx.testKeyGroup;
  ensureTemporaryGroupAllowed(providerGroup, ctx);
  ensurePortalUser(await findUserById(body.sourceUserId), ctx);

  const result = await createTemporaryKeyBatch({
    providerGroup,
    sourceUserId: body.sourceUserId,
    sourceKeyId: body.sourceKeyId,
    count: body.count,
    name: body.name,
    customLimitTotalUsd: body.customLimitTotalUsd,
    createdByUserId: null,
  });

  return json(
    {
      ok: true,
      data: {
        batch: result.batch,
        keys: result.keys.map((key) => serializeKey(key, { includeFullKey: true })),
      },
    },
    201
  );
}

async function downloadPortalTemporaryBatch(
  batchId: number,
  request: Request,
  ctx: PortalContext
): Promise<Response> {
  const providerGroup = new URL(request.url).searchParams.get("providerGroup");
  if (!providerGroup) {
    return errorJson("providerGroup 是必填参数", 400, "PROVIDER_GROUP_REQUIRED");
  }
  ensureTemporaryGroupAllowed(providerGroup, ctx);
  const result = await getTemporaryKeyBatchForDownload(batchId, providerGroup);
  return json({
    ok: true,
    data: {
      batch: result.batch,
      keys: result.keys.map((key) => serializeKey(key, { includeFullKey: true })),
    },
  });
}

async function deletePortalTemporaryBatch(
  batchId: number,
  request: Request,
  ctx: PortalContext
): Promise<Response> {
  const providerGroup = new URL(request.url).searchParams.get("providerGroup");
  if (!providerGroup) {
    return errorJson("providerGroup 是必填参数", 400, "PROVIDER_GROUP_REQUIRED");
  }
  ensureTemporaryGroupAllowed(providerGroup, ctx);
  const result = await deleteTemporaryKeyBatch({ batchId, providerGroup });
  return json({ ok: true, data: result });
}

async function listPortalPlansForFkcodex(): Promise<Response> {
  const plans = await listPortalPlansRepository({ includeDisabled: false });
  return json({ ok: true, data: { plans: plans.map(serializePortalPlan) } });
}

export function readLimit(request: Request): number {
  const value = Number(new URL(request.url).searchParams.get("limit") ?? 100);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 500) : 100;
}

async function listPortalSubscriptionsForFkcodex(request: Request): Promise<Response> {
  const subscriptions = await listPortalSubscriptionsRepository(readLimit(request));
  return json({
    ok: true,
    data: { subscriptions: subscriptions.map(serializePortalSubscription) },
  });
}

async function getPortalSubscriptionForFkcodex(subscriptionId: number): Promise<Response> {
  const subscription = await findPortalSubscriptionById(subscriptionId);
  if (!subscription) return errorJson("Not Found", 404, "NOT_FOUND");
  return json({
    ok: true,
    data: { subscription: serializePortalSubscription(subscription) },
  });
}

async function provisionPortalSubscriptionForFkcodex(request: Request): Promise<Response> {
  const input = portalSubscriptionProvisionSchema.parse(await readJson(request));
  const result = await provisionPortalSubscription(input);
  const serialized = serializePortalProvisionResult(result);
  const callback = await notifyFkWebPortalEvent("portal.subscription.provisioned", {
    result: serialized,
  });

  return json(
    {
      ok: true,
      data: {
        result: serialized,
        callback,
      },
    },
    result.idempotent ? 200 : 201
  );
}

async function revokePortalSubscriptionForFkcodex(subscriptionId: number): Promise<Response> {
  const subscription = await setPortalSubscriptionStatus(subscriptionId, "revoked");
  if (!subscription) return errorJson("Not Found", 404, "NOT_FOUND");

  const serialized = serializePortalSubscription(subscription);
  const callback = await notifyFkWebPortalEvent("portal.subscription.revoked", {
    subscription: serialized,
  });

  return json({
    ok: true,
    data: {
      subscription: serialized,
      callback,
    },
  });
}

function requiredScopes(method: string, route: string[]): PortalAccessScope[] {
  if (method === "GET" && route.length === 1 && route[0] === "plans") {
    return ["plan:read"];
  }
  if (route[0] === "subscriptions") {
    if (method === "GET") return ["subscription:read"];
    if (method === "POST" || method === "PATCH") return ["subscription:write"];
  }
  return ["management"];
}

async function dispatch(request: Request, method: string, route: string[], ctx: PortalContext) {
  if (method === "GET" && route.length === 1 && route[0] === "plans") {
    return listPortalPlansForFkcodex();
  }
  if (method === "GET" && route.length === 1 && route[0] === "subscriptions") {
    return listPortalSubscriptionsForFkcodex(request);
  }
  if (method === "GET" && route.length === 2 && route[0] === "subscriptions") {
    const subscriptionId = parseId(route[1]);
    return subscriptionId
      ? getPortalSubscriptionForFkcodex(subscriptionId)
      : errorJson("Invalid subscription id", 400);
  }
  if (
    method === "POST" &&
    route.length === 2 &&
    route[0] === "subscriptions" &&
    route[1] === "provision"
  ) {
    return provisionPortalSubscriptionForFkcodex(request);
  }
  if (
    method === "PATCH" &&
    route.length === 3 &&
    route[0] === "subscriptions" &&
    route[2] === "revoke"
  ) {
    const subscriptionId = parseId(route[1]);
    return subscriptionId
      ? revokePortalSubscriptionForFkcodex(subscriptionId)
      : errorJson("Invalid subscription id", 400);
  }
  if (method === "GET" && route.length === 1 && route[0] === "users") {
    return listPortalUsers(ctx);
  }
  if (method === "POST" && route.length === 1 && route[0] === "users") {
    return createPortalUser(request, ctx);
  }
  if (method === "PATCH" && route.length === 2 && route[0] === "users") {
    const userId = parseId(route[1]);
    return userId ? updatePortalUser(request, userId, ctx) : errorJson("Invalid user id", 400);
  }
  if (method === "GET" && route.length === 3 && route[0] === "users" && route[2] === "keys") {
    const userId = parseId(route[1]);
    return userId ? listPortalKeys(userId, ctx) : errorJson("Invalid user id", 400);
  }
  if (method === "POST" && route.length === 3 && route[0] === "users" && route[2] === "keys") {
    const userId = parseId(route[1]);
    return userId ? createPortalKey(request, userId, ctx) : errorJson("Invalid user id", 400);
  }
  if (method === "PATCH" && route.length === 4 && route[0] === "users" && route[2] === "keys") {
    const userId = parseId(route[1]);
    const keyId = parseId(route[3]);
    return userId && keyId
      ? updatePortalKey(request, userId, keyId, ctx)
      : errorJson("Invalid user or key id", 400);
  }
  if (method === "DELETE" && route.length === 4 && route[0] === "users" && route[2] === "keys") {
    const userId = parseId(route[1]);
    const keyId = parseId(route[3]);
    return userId && keyId
      ? deletePortalKey(userId, keyId, ctx)
      : errorJson("Invalid user or key id", 400);
  }
  if (method === "POST" && route.length === 1 && route[0] === "temporary-key-batches") {
    return createPortalTemporaryBatch(request, ctx);
  }
  if (
    method === "GET" &&
    route.length === 3 &&
    route[0] === "temporary-key-batches" &&
    route[2] === "download"
  ) {
    const batchId = parseId(route[1]);
    return batchId
      ? downloadPortalTemporaryBatch(batchId, request, ctx)
      : errorJson("Invalid batch id", 400);
  }
  if (method === "DELETE" && route.length === 2 && route[0] === "temporary-key-batches") {
    const batchId = parseId(route[1]);
    return batchId
      ? deletePortalTemporaryBatch(batchId, request, ctx)
      : errorJson("Invalid batch id", 400);
  }

  return errorJson("Not Found", 404, "NOT_FOUND");
}

async function handlePortalRequest(request: Request, context: RouteContext): Promise<Response> {
  try {
    const params = await context.params;
    const route = params.route ?? [];
    if (route.some((part) => !part)) {
      return errorJson("Invalid route", 400, "INVALID_ROUTE");
    }
    const ctx = validatePortalRequest(request, { scopes: requiredScopes(request.method, route) });
    if (!ctx) {
      return errorJson("Unauthorized", 401, "UNAUTHORIZED");
    }
    return await dispatch(request, request.method, route, ctx);
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof PortalSubscriptionError) {
      return errorJson(error.message, error.status, error.code);
    }
    if (error instanceof TemporaryKeyBatchError) {
      return errorJson(error.message, error.status, error.code);
    }
    if (error instanceof z.ZodError) {
      return errorJson(error.issues[0]?.message ?? "请求参数不合法", 400, "VALIDATION_ERROR");
    }
    return errorJson("请求失败", 500, "INTERNAL_ERROR");
  }
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return handlePortalRequest(request, context);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return handlePortalRequest(request, context);
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return handlePortalRequest(request, context);
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return handlePortalRequest(request, context);
}
