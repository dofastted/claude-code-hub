import "server-only";

export interface PortalRuntimeConfig {
  PORTAL_MANAGEMENT_TOKEN?: string;
  PORTAL_PROVIDER_GROUP: string;
  PORTAL_TEST_KEY_GROUP: string;
  FKCODEX_PORTAL_PLAN_READ_TOKEN?: string;
  FKCODEX_PORTAL_SUBSCRIPTION_READ_TOKEN?: string;
  FKCODEX_PORTAL_SUBSCRIPTION_WRITE_TOKEN?: string;
  FK_WEB_PORTAL_CALLBACK_URL?: string;
  FK_WEB_PORTAL_CALLBACK_TOKEN?: string;
  FK_WEB_PORTAL_CALLBACK_SIGNING_SECRET?: string;
}

function optionalToken(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value || value === "change-me") return undefined;
  return value;
}

function optionalText(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function getPortalConfig(): PortalRuntimeConfig {
  return {
    PORTAL_MANAGEMENT_TOKEN: optionalToken("PORTAL_MANAGEMENT_TOKEN"),
    PORTAL_PROVIDER_GROUP: optionalText("PORTAL_PROVIDER_GROUP") ?? "portal",
    PORTAL_TEST_KEY_GROUP: optionalText("PORTAL_TEST_KEY_GROUP") ?? "test-key",
    FKCODEX_PORTAL_PLAN_READ_TOKEN: optionalToken("FKCODEX_PORTAL_PLAN_READ_TOKEN"),
    FKCODEX_PORTAL_SUBSCRIPTION_READ_TOKEN: optionalToken("FKCODEX_PORTAL_SUBSCRIPTION_READ_TOKEN"),
    FKCODEX_PORTAL_SUBSCRIPTION_WRITE_TOKEN: optionalToken(
      "FKCODEX_PORTAL_SUBSCRIPTION_WRITE_TOKEN"
    ),
    FK_WEB_PORTAL_CALLBACK_URL: optionalText("FK_WEB_PORTAL_CALLBACK_URL"),
    FK_WEB_PORTAL_CALLBACK_TOKEN: optionalToken("FK_WEB_PORTAL_CALLBACK_TOKEN"),
    FK_WEB_PORTAL_CALLBACK_SIGNING_SECRET: optionalToken(
      "FK_WEB_PORTAL_CALLBACK_SIGNING_SECRET"
    ),
  };
}
