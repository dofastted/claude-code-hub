export type PortalSubscriptionStatus = "active" | "revoked" | "expired";

export interface PortalPlan {
  id: number;
  planId: string;
  name: string;
  description: string | null;
  priceAmount: number;
  currency: string;
  validDays: number;
  providerGroup: string;
  weeklyLimitUsd: number;
  monthlyLimitUsd: number;
  totalLimitUsd: number;
  rpmLimit: number;
  enabled: boolean;
  sortOrder: number;
  features: string[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface UpsertPortalPlanInput {
  planId: string;
  name: string;
  description?: string | null;
  priceAmount?: number;
  currency?: string;
  validDays?: number;
  providerGroup?: string;
  weeklyLimitUsd?: number;
  monthlyLimitUsd?: number;
  totalLimitUsd?: number;
  rpmLimit?: number;
  enabled?: boolean;
  sortOrder?: number;
  features?: string[];
}

export interface PortalUserLink {
  id: number;
  portalUserId: string;
  email: string;
  cchUserId: number;
  defaultKeyId: number;
  lastProvisionedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertPortalUserLinkInput {
  portalUserId: string;
  email: string;
  cchUserId: number;
  defaultKeyId: number;
  lastProvisionedAt?: Date | null;
}

export interface PortalSubscription {
  id: number;
  sourceOrderId: string;
  portalUserId: string;
  email: string;
  planId: string;
  status: PortalSubscriptionStatus;
  startsAt: Date;
  expiresAt: Date;
  assignedSource: string;
  providerGroup: string;
  weeklyLimitUsd: number;
  monthlyLimitUsd: number;
  totalLimitUsd: number;
  rpmLimit: number;
  cchUserId: number;
  defaultKeyId: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePortalSubscriptionInput {
  sourceOrderId: string;
  portalUserId: string;
  email: string;
  planId: string;
  status?: PortalSubscriptionStatus;
  startsAt: Date;
  expiresAt: Date;
  assignedSource?: string;
  providerGroup: string;
  weeklyLimitUsd: number;
  monthlyLimitUsd: number;
  totalLimitUsd: number;
  rpmLimit: number;
  cchUserId: number;
  defaultKeyId: number;
  notes?: string | null;
}

export interface ProvisionPortalSubscriptionInput {
  sourceOrderId: string;
  portalUserId: string;
  email: string;
  planId: string;
  assignedSource?: string;
  notes?: string | null;
}

export interface ProvisionPortalSubscriptionResult {
  idempotent: boolean;
  plan: PortalPlan;
  portalUser: PortalUserLink;
  subscription: PortalSubscription;
  cchUser: {
    id: number;
    name: string;
    expiresAt: Date | null;
    rpm: number | null;
    providerGroup: string | null;
    limitWeeklyUsd: number | null;
    limitMonthlyUsd: number | null;
    limitTotalUsd: number | null;
  };
  defaultKey: {
    id: number;
    name: string;
    key: string;
    expiresAt: Date | null | undefined;
    providerGroup: string | null;
    limitWeeklyUsd: number | null;
    limitMonthlyUsd: number | null;
    limitTotalUsd: number | null | undefined;
  };
}
