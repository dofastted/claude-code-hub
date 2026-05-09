import type { PublicStatusPayload, PublicStatusTimelineState } from "@/lib/public-status/payload";
import {
  buildPublicStatusRouteResponse,
  type ParsedPublicStatusQuery,
  type PublicStatusQueryDefaults,
  type PublicStatusRouteResponse,
} from "@/lib/public-status/public-api-contract";

export const PUBLIC_STATUS_DEV_MOCK_QUERY_VALUE = "1";

export function isPublicStatusDevMockEnabled(searchParams: URLSearchParams): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    searchParams.get("mock") === PUBLIC_STATUS_DEV_MOCK_QUERY_VALUE
  );
}

export function isPublicStatusDevMockSearchParamValue(
  value: string | string[] | undefined
): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  return Array.isArray(value)
    ? value.includes(PUBLIC_STATUS_DEV_MOCK_QUERY_VALUE)
    : value === PUBLIC_STATUS_DEV_MOCK_QUERY_VALUE;
}

function buildTimeline(input: {
  state: PublicStatusTimelineState;
  intervalMinutes: number;
  rangeHours: number;
  ttfbMs: number | null;
  tps: number | null;
}) {
  const bucketCount = Math.min(
    Math.max(Math.ceil((input.rangeHours * 60) / input.intervalMinutes), 12),
    96
  );
  const bucketMs = Math.max(
    input.intervalMinutes * 60 * 1000,
    Math.floor((input.rangeHours * 60 * 60 * 1000) / bucketCount)
  );
  const nowMs = Date.now();
  const firstBucketMs = nowMs - bucketMs * bucketCount;

  return Array.from({ length: bucketCount }, (_, index) => {
    const bucketStartMs = firstBucketMs + bucketMs * index;
    const bucketEndMs = bucketStartMs + bucketMs;
    const isLatest = index >= bucketCount - 2;
    const isOlderIncident = index % 17 === 4;
    const isOlderDegradation = index % 11 === 3;
    let state = input.state;

    if (input.state === "operational") {
      state = isOlderDegradation ? "degraded" : "operational";
    } else if (input.state === "degraded") {
      state = isLatest || isOlderDegradation ? "degraded" : "operational";
    } else if (input.state === "failed") {
      state =
        isLatest || isOlderIncident ? "failed" : isOlderDegradation ? "degraded" : "operational";
    }

    const availabilityPct =
      state === "no_data"
        ? null
        : state === "failed"
          ? 0
          : state === "degraded"
            ? 42 + (index % 4) * 3
            : 98.7 - (index % 3) * 0.2;

    return {
      bucketStart: new Date(bucketStartMs).toISOString(),
      bucketEnd: new Date(bucketEndMs).toISOString(),
      state,
      availabilityPct,
      ttfbMs:
        availabilityPct === null ? null : input.ttfbMs === null ? null : input.ttfbMs + index * 7,
      tps: availabilityPct === null ? null : input.tps === null ? null : input.tps + (index % 5),
      sampleCount: availabilityPct === null ? 0 : 18 + (index % 9),
    };
  });
}

function buildMockPayload(query: ParsedPublicStatusQuery): PublicStatusPayload {
  const generatedAt = new Date().toISOString();
  const freshUntil = new Date(Date.now() + query.intervalMinutes * 60 * 1000).toISOString();

  return {
    rebuildState: "fresh",
    sourceGeneration: "dev-mock-public-status",
    generatedAt,
    freshUntil,
    groups: [
      {
        publicGroupSlug: "openai-core",
        displayName: "OpenAI Core",
        explanatoryCopy: "Development preview data for OpenAI-compatible traffic.",
        models: [
          {
            publicModelKey: "gpt-5.1",
            label: "GPT-5.1",
            vendorIconKey: "openai",
            requestTypeBadge: "openaiCompatible",
            latestState: "operational",
            availabilityPct: 99.92,
            latestTtfbMs: 740,
            latestTps: 41,
            timeline: buildTimeline({
              state: "operational",
              intervalMinutes: query.intervalMinutes,
              rangeHours: query.rangeHours,
              ttfbMs: 720,
              tps: 38,
            }),
          },
          {
            publicModelKey: "gpt-5.1-mini",
            label: "GPT-5.1 Mini",
            vendorIconKey: "openai",
            requestTypeBadge: "openaiCompatible",
            latestState: "degraded",
            availabilityPct: 47.5,
            latestTtfbMs: 1860,
            latestTps: 14,
            timeline: buildTimeline({
              state: "degraded",
              intervalMinutes: query.intervalMinutes,
              rangeHours: query.rangeHours,
              ttfbMs: 1540,
              tps: 12,
            }),
          },
        ],
      },
      {
        publicGroupSlug: "anthropic-edge",
        displayName: "Anthropic Edge",
        explanatoryCopy: "Development preview data for Claude gateway routing.",
        models: [
          {
            publicModelKey: "claude-sonnet-4.5",
            label: "Claude Sonnet 4.5",
            vendorIconKey: "anthropic",
            requestTypeBadge: "anthropic",
            latestState: "failed",
            availabilityPct: 0,
            latestTtfbMs: null,
            latestTps: null,
            timeline: buildTimeline({
              state: "failed",
              intervalMinutes: query.intervalMinutes,
              rangeHours: query.rangeHours,
              ttfbMs: 2400,
              tps: 4,
            }),
          },
          {
            publicModelKey: "claude-opus-4.1",
            label: "Claude Opus 4.1",
            vendorIconKey: "anthropic",
            requestTypeBadge: "anthropic",
            latestState: "operational",
            availabilityPct: 99.48,
            latestTtfbMs: 980,
            latestTps: 26,
            timeline: buildTimeline({
              state: "operational",
              intervalMinutes: query.intervalMinutes,
              rangeHours: query.rangeHours,
              ttfbMs: 930,
              tps: 23,
            }),
          },
        ],
      },
      {
        publicGroupSlug: "regional-gateway",
        displayName: "Regional Gateway",
        explanatoryCopy: "Mixed provider preview data with unavailable and quiet models.",
        models: [
          {
            publicModelKey: "gemini-2.5-pro",
            label: "Gemini 2.5 Pro",
            vendorIconKey: "gemini",
            requestTypeBadge: "gemini",
            latestState: "degraded",
            availabilityPct: 43.2,
            latestTtfbMs: 2100,
            latestTps: 11,
            timeline: buildTimeline({
              state: "degraded",
              intervalMinutes: query.intervalMinutes,
              rangeHours: query.rangeHours,
              ttfbMs: 1780,
              tps: 9,
            }),
          },
          {
            publicModelKey: "qwen3-coder",
            label: "Qwen3 Coder",
            vendorIconKey: "qwen",
            requestTypeBadge: "openaiCompatible",
            latestState: "no_data",
            availabilityPct: null,
            latestTtfbMs: null,
            latestTps: null,
            timeline: buildTimeline({
              state: "no_data",
              intervalMinutes: query.intervalMinutes,
              rangeHours: query.rangeHours,
              ttfbMs: null,
              tps: null,
            }),
          },
          {
            publicModelKey: "deepseek-reasoner",
            label: "DeepSeek Reasoner",
            vendorIconKey: "deepseek",
            requestTypeBadge: "openaiCompatible",
            latestState: "failed",
            availabilityPct: 0,
            latestTtfbMs: null,
            latestTps: null,
            timeline: buildTimeline({
              state: "failed",
              intervalMinutes: query.intervalMinutes,
              rangeHours: query.rangeHours,
              ttfbMs: 2600,
              tps: 3,
            }),
          },
        ],
      },
    ],
  };
}

export function buildPublicStatusDevMockRouteResponse(input: {
  query: ParsedPublicStatusQuery;
  defaults: PublicStatusQueryDefaults;
}): PublicStatusRouteResponse {
  return buildPublicStatusRouteResponse({
    payload: buildMockPayload(input.query),
    query: input.query,
    defaults: input.defaults,
    meta: {
      siteTitle: "Claude Code Hub",
      siteDescription: "Development public status mock",
      timeZone: "UTC",
    },
  });
}
