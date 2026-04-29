import "server-only";

import { getPortalConfig } from "@/fork/portal/config";

export type PortalWebhookEvent = "portal.subscription.provisioned" | "portal.subscription.revoked";

export interface PortalWebhookResult {
  skipped: boolean;
  ok: boolean;
  status?: number;
  error?: string;
}

export async function notifyFkWebPortalEvent(
  event: PortalWebhookEvent,
  payload: Record<string, unknown>
): Promise<PortalWebhookResult> {
  const env = getPortalConfig();
  const url = env.FK_WEB_PORTAL_CALLBACK_URL;
  const token = env.FK_WEB_PORTAL_CALLBACK_TOKEN;

  if (!url || !token) {
    return { skipped: true, ok: true };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "cch-portal/1.0",
      },
      body: JSON.stringify({
        event,
        data: payload,
      }),
    });

    return {
      skipped: false,
      ok: response.ok,
      status: response.status,
      error: response.ok ? undefined : `Callback returned HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      skipped: false,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
