import type {
  PortalPlan,
  PortalSubscription,
  PortalUserLink,
  ProvisionPortalSubscriptionResult,
} from "@/fork/portal/types/portal";

export function serializePortalPlan(plan: PortalPlan) {
  return {
    ...plan,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    deletedAt: plan.deletedAt?.toISOString() ?? null,
  };
}

export function serializePortalUserLink(link: PortalUserLink) {
  return {
    ...link,
    lastProvisionedAt: link.lastProvisionedAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
  };
}

export function serializePortalSubscription(subscription: PortalSubscription) {
  return {
    ...subscription,
    startsAt: subscription.startsAt.toISOString(),
    expiresAt: subscription.expiresAt.toISOString(),
    createdAt: subscription.createdAt.toISOString(),
    updatedAt: subscription.updatedAt.toISOString(),
  };
}

export function serializePortalProvisionResult(result: ProvisionPortalSubscriptionResult) {
  return {
    ...result,
    plan: serializePortalPlan(result.plan),
    portalUser: serializePortalUserLink(result.portalUser),
    subscription: serializePortalSubscription(result.subscription),
    cchUser: {
      ...result.cchUser,
      expiresAt: result.cchUser.expiresAt?.toISOString() ?? null,
    },
    defaultKey: {
      ...result.defaultKey,
      expiresAt: result.defaultKey.expiresAt?.toISOString() ?? null,
    },
  };
}
