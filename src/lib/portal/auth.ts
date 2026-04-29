import "server-only";

import { getEnvConfig } from "@/lib/config/env.schema";
import { constantTimeEqual } from "@/lib/security/constant-time-compare";

export interface PortalAuthContext {
  providerGroup: string;
  testKeyGroup: string;
  scope: PortalAccessScope;
}

export type PortalAccessScope =
  | "management"
  | "plan:read"
  | "subscription:read"
  | "subscription:write";

export interface PortalAuthOptions {
  scopes?: PortalAccessScope[];
}

function readBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim() || null;
}

function expectedTokenForScope(scope: PortalAccessScope): string | undefined {
  const env = getEnvConfig();
  switch (scope) {
    case "management":
      return env.PORTAL_MANAGEMENT_TOKEN;
    case "plan:read":
      return env.FKCODEX_PORTAL_PLAN_READ_TOKEN;
    case "subscription:read":
      return env.FKCODEX_PORTAL_SUBSCRIPTION_READ_TOKEN;
    case "subscription:write":
      return env.FKCODEX_PORTAL_SUBSCRIPTION_WRITE_TOKEN;
  }
}

export function validatePortalRequest(
  request: Request,
  options: PortalAuthOptions = {}
): PortalAuthContext | null {
  const env = getEnvConfig();
  const scopes: PortalAccessScope[] = options.scopes?.length ? options.scopes : ["management"];

  const token = readBearerToken(request);
  if (!token) {
    return null;
  }

  const matchedScope = scopes.find((scope) => {
    const expected = expectedTokenForScope(scope);
    return Boolean(expected && constantTimeEqual(token, expected));
  });

  if (!matchedScope) return null;

  return {
    providerGroup: env.PORTAL_PROVIDER_GROUP,
    testKeyGroup: env.PORTAL_TEST_KEY_GROUP,
    scope: matchedScope,
  };
}
