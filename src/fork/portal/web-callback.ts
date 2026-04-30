import "server-only";

import { createHmac } from "node:crypto";
import { getPortalConfig } from "@/fork/portal/config";

export type PortalWebhookEvent = "portal.subscription.provisioned" | "portal.subscription.revoked";

export interface PortalWebhookResult {
  skipped: boolean;
  ok: boolean;
  status?: number;
  error?: string;
}

export function signFkWebPortalCallbackBody(
  secret: string,
  timestamp: string,
  rawBody: string
): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `sha256=${digest}`;
}

export async function notifyFkWebPortalEvent(
  event: PortalWebhookEvent,
  payload: Record<string, unknown>
): Promise<PortalWebhookResult> {
  const env = getPortalConfig();
  const url = env.FK_WEB_PORTAL_CALLBACK_URL;
  const token = env.FK_WEB_PORTAL_CALLBACK_TOKEN;
  const signingSecret = env.FK_WEB_PORTAL_CALLBACK_SIGNING_SECRET;

  if (!url || !token) {
    return { skipped: true, ok: true };
  }
  if (!signingSecret) {
    return {
      skipped: false,
      ok: false,
      error: "FK_WEB_PORTAL_CALLBACK_SIGNING_SECRET is required.",
    };
  }

  try {
    const timestamp = String(Date.now());
    const body = JSON.stringify({
      event,
      data: payload,
    });
    const signature = signFkWebPortalCallbackBody(signingSecret, timestamp, body);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "cch-portal/1.0",
        "X-FK-Portal-Timestamp": timestamp,
        "X-FK-Portal-Signature": signature,
      },
      body,
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
