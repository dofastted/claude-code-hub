import "server-only";

import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/drizzle/db";
import { portalPlans, portalSubscriptions, portalUserLinks } from "@/drizzle/schema";
import { getEnvConfig } from "@/lib/config/env.schema";
import type {
  CreatePortalSubscriptionInput,
  PortalPlan,
  PortalSubscription,
  PortalSubscriptionStatus,
  PortalUserLink,
  UpsertPortalPlanInput,
  UpsertPortalUserLinkInput,
} from "@/types/portal";

type PortalPlanRow = typeof portalPlans.$inferSelect;
type PortalUserLinkRow = typeof portalUserLinks.$inferSelect;
type PortalSubscriptionRow = typeof portalSubscriptions.$inferSelect;

function numberFromDb(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanString(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed || fallback;
}

export function resolvePortalPlanProviderGroup(providerGroup?: string): string {
  const defaultProviderGroup = getEnvConfig().PORTAL_PROVIDER_GROUP;
  return cleanString(providerGroup ?? defaultProviderGroup, defaultProviderGroup);
}

function toPortalPlan(row: PortalPlanRow): PortalPlan {
  return {
    id: row.id,
    planId: row.planId,
    name: row.name,
    description: row.description ?? null,
    priceAmount: numberFromDb(row.priceAmount),
    currency: row.currency,
    validDays: row.validDays,
    providerGroup: row.providerGroup,
    weeklyLimitUsd: numberFromDb(row.weeklyLimitUsd),
    monthlyLimitUsd: numberFromDb(row.monthlyLimitUsd),
    totalLimitUsd: numberFromDb(row.totalLimitUsd),
    rpmLimit: row.rpmLimit,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    features: Array.isArray(row.features) ? row.features : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? null,
  };
}

function toPortalUserLink(row: PortalUserLinkRow): PortalUserLink {
  return {
    id: row.id,
    portalUserId: row.portalUserId,
    email: row.email,
    cchUserId: row.cchUserId,
    defaultKeyId: row.defaultKeyId,
    lastProvisionedAt: row.lastProvisionedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPortalSubscription(row: PortalSubscriptionRow): PortalSubscription {
  return {
    id: row.id,
    sourceOrderId: row.sourceOrderId,
    portalUserId: row.portalUserId,
    email: row.email,
    planId: row.planId,
    status: row.status as PortalSubscriptionStatus,
    startsAt: row.startsAt,
    expiresAt: row.expiresAt,
    assignedSource: row.assignedSource,
    providerGroup: row.providerGroup,
    weeklyLimitUsd: numberFromDb(row.weeklyLimitUsd),
    monthlyLimitUsd: numberFromDb(row.monthlyLimitUsd),
    totalLimitUsd: numberFromDb(row.totalLimitUsd),
    rpmLimit: row.rpmLimit,
    cchUserId: row.cchUserId,
    defaultKeyId: row.defaultKeyId,
    notes: row.notes ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listPortalPlans(options?: {
  includeDisabled?: boolean;
}): Promise<PortalPlan[]> {
  const conditions = [isNull(portalPlans.deletedAt)];
  if (!options?.includeDisabled) {
    conditions.push(eq(portalPlans.enabled, true));
  }

  const rows = await db
    .select()
    .from(portalPlans)
    .where(and(...conditions))
    .orderBy(asc(portalPlans.sortOrder), asc(portalPlans.planId));

  return rows.map(toPortalPlan);
}

export async function findPortalPlanByPlanId(planId: string): Promise<PortalPlan | null> {
  const normalized = planId.trim();
  if (!normalized) return null;

  const [row] = await db
    .select()
    .from(portalPlans)
    .where(and(eq(portalPlans.planId, normalized), isNull(portalPlans.deletedAt)))
    .limit(1);

  return row ? toPortalPlan(row) : null;
}

export async function upsertPortalPlan(input: UpsertPortalPlanInput): Promise<PortalPlan> {
  const planId = cleanString(input.planId, "");
  if (!planId) throw new Error("planId is required");

  const values = {
    planId,
    name: cleanString(input.name, planId),
    description: cleanText(input.description),
    priceAmount: String(input.priceAmount ?? 0),
    currency: cleanString(input.currency ?? "rmb", "rmb").toLowerCase(),
    validDays: Math.max(0, Math.trunc(input.validDays ?? 30)),
    providerGroup: resolvePortalPlanProviderGroup(input.providerGroup),
    weeklyLimitUsd: String(input.weeklyLimitUsd ?? 0),
    monthlyLimitUsd: String(input.monthlyLimitUsd ?? 0),
    totalLimitUsd: String(input.totalLimitUsd ?? 0),
    rpmLimit: Math.max(1, Math.trunc(input.rpmLimit ?? 30)),
    enabled: input.enabled ?? true,
    sortOrder: Math.trunc(input.sortOrder ?? 0),
    features: input.features ?? [],
  };

  const [row] = await db
    .insert(portalPlans)
    .values(values)
    .onConflictDoUpdate({
      target: portalPlans.planId,
      set: {
        ...values,
        updatedAt: new Date(),
        deletedAt: null,
      },
    })
    .returning();

  return toPortalPlan(row);
}

export async function setPortalPlanEnabled(
  planId: string,
  enabled: boolean
): Promise<PortalPlan | null> {
  const [row] = await db
    .update(portalPlans)
    .set({ enabled, updatedAt: new Date() })
    .where(and(eq(portalPlans.planId, planId.trim()), isNull(portalPlans.deletedAt)))
    .returning();

  return row ? toPortalPlan(row) : null;
}

export async function deletePortalPlan(planId: string): Promise<PortalPlan | null> {
  const [row] = await db
    .update(portalPlans)
    .set({ deletedAt: new Date(), enabled: false, updatedAt: new Date() })
    .where(and(eq(portalPlans.planId, planId.trim()), isNull(portalPlans.deletedAt)))
    .returning();

  return row ? toPortalPlan(row) : null;
}

export async function listPortalUserLinks(limit = 100): Promise<PortalUserLink[]> {
  const rows = await db
    .select()
    .from(portalUserLinks)
    .orderBy(desc(portalUserLinks.updatedAt))
    .limit(Math.max(1, Math.min(limit, 500)));

  return rows.map(toPortalUserLink);
}

export async function findPortalUserLinkByPortalUserId(
  portalUserId: string
): Promise<PortalUserLink | null> {
  const normalized = portalUserId.trim();
  if (!normalized) return null;

  const [row] = await db
    .select()
    .from(portalUserLinks)
    .where(eq(portalUserLinks.portalUserId, normalized))
    .limit(1);

  return row ? toPortalUserLink(row) : null;
}

export async function upsertPortalUserLink(
  input: UpsertPortalUserLinkInput
): Promise<PortalUserLink> {
  const values = {
    portalUserId: cleanString(input.portalUserId, ""),
    email: cleanString(input.email, ""),
    cchUserId: input.cchUserId,
    defaultKeyId: input.defaultKeyId,
    lastProvisionedAt: input.lastProvisionedAt ?? null,
  };

  if (!values.portalUserId) throw new Error("portalUserId is required");
  if (!values.email) throw new Error("email is required");

  const [row] = await db
    .insert(portalUserLinks)
    .values(values)
    .onConflictDoUpdate({
      target: portalUserLinks.portalUserId,
      set: {
        email: values.email,
        cchUserId: values.cchUserId,
        defaultKeyId: values.defaultKeyId,
        lastProvisionedAt: values.lastProvisionedAt,
        updatedAt: new Date(),
      },
    })
    .returning();

  return toPortalUserLink(row);
}

export async function listPortalSubscriptions(limit = 100): Promise<PortalSubscription[]> {
  const rows = await db
    .select()
    .from(portalSubscriptions)
    .orderBy(desc(portalSubscriptions.createdAt))
    .limit(Math.max(1, Math.min(limit, 500)));

  return rows.map(toPortalSubscription);
}

export async function findPortalSubscriptionById(id: number): Promise<PortalSubscription | null> {
  const [row] = await db
    .select()
    .from(portalSubscriptions)
    .where(eq(portalSubscriptions.id, id))
    .limit(1);

  return row ? toPortalSubscription(row) : null;
}

export async function findPortalSubscriptionBySourceOrderId(
  sourceOrderId: string
): Promise<PortalSubscription | null> {
  const normalized = sourceOrderId.trim();
  if (!normalized) return null;

  const [row] = await db
    .select()
    .from(portalSubscriptions)
    .where(eq(portalSubscriptions.sourceOrderId, normalized))
    .limit(1);

  return row ? toPortalSubscription(row) : null;
}

export async function createPortalSubscription(
  input: CreatePortalSubscriptionInput
): Promise<PortalSubscription> {
  const [row] = await db
    .insert(portalSubscriptions)
    .values({
      sourceOrderId: input.sourceOrderId.trim(),
      portalUserId: input.portalUserId.trim(),
      email: input.email.trim(),
      planId: input.planId.trim(),
      status: input.status ?? "active",
      startsAt: input.startsAt,
      expiresAt: input.expiresAt,
      assignedSource: input.assignedSource?.trim() || "portal",
      providerGroup: input.providerGroup,
      weeklyLimitUsd: String(input.weeklyLimitUsd),
      monthlyLimitUsd: String(input.monthlyLimitUsd),
      totalLimitUsd: String(input.totalLimitUsd),
      rpmLimit: input.rpmLimit,
      cchUserId: input.cchUserId,
      defaultKeyId: input.defaultKeyId,
      notes: cleanText(input.notes),
    })
    .returning();

  return toPortalSubscription(row);
}

export async function setPortalSubscriptionStatus(
  id: number,
  status: PortalSubscriptionStatus
): Promise<PortalSubscription | null> {
  const [row] = await db
    .update(portalSubscriptions)
    .set({ status, updatedAt: new Date() })
    .where(eq(portalSubscriptions.id, id))
    .returning();

  return row ? toPortalSubscription(row) : null;
}
