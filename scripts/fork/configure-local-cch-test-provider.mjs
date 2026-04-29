#!/usr/bin/env node

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const envPath = resolve(repoRoot, ".env.local");

if (existsSync(envPath)) {
  dotenv.config({ path: envPath, quiet: true });
}

const PROVIDER_NAME = process.env.CCH_TEST_PROVIDER_NAME?.trim() || "fkcodex remote test";
const PROVIDER_URL = (process.env.CCH_TEST_PROVIDER_URL?.trim() || "https://cch.fkcodex.com").replace(
  /\/+$/,
  ""
);
const PROVIDER_TYPE = process.env.CCH_TEST_PROVIDER_TYPE?.trim() || "codex";
const PROVIDER_GROUP = process.env.CCH_TEST_PROVIDER_GROUP?.trim() || "portal";
const PROVIDER_KEY = process.env.CCH_TEST_PROVIDER_KEY?.trim();

function fail(message) {
  console.error(`[provider:local-cch-test] ${message}`);
  process.exit(1);
}

function assertLocalDsn(dsn) {
  let url;
  try {
    url = new URL(dsn);
  } catch (error) {
    fail(`DSN is not a valid URL: ${error instanceof Error ? error.message : String(error)}`);
  }

  const hostname = url.hostname.toLowerCase();
  if (!new Set(["localhost", "127.0.0.1", "::1"]).has(hostname)) {
    fail(`Refusing to configure provider on non-local DSN host "${hostname}".`);
  }

  return { hostname, database: url.pathname.replace(/^\//, "") || "(default)" };
}

function vendorDomainFromUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  return parsed.hostname.replace(/^www\./, "").toLowerCase();
}

function publicProvider(row) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    providerType: row.provider_type,
    groupTag: row.group_tag,
    isEnabled: row.is_enabled,
    key: "[redacted]",
  };
}

async function main() {
  const dsn = process.env.DSN?.trim();
  if (!dsn) fail("DSN is required in .env.local.");
  if (!PROVIDER_KEY) fail("CCH_TEST_PROVIDER_KEY is required.");

  const dsnInfo = assertLocalDsn(dsn);
  const sql = postgres(dsn, { max: 1 });

  try {
    const result = await sql.begin(async (tx) => {
      const vendorDomain = vendorDomainFromUrl(PROVIDER_URL);
      const [vendor] = await tx`
        INSERT INTO provider_vendors (website_domain, display_name, website_url)
        VALUES (${vendorDomain}, 'fkcodex remote CCH', ${PROVIDER_URL})
        ON CONFLICT (website_domain) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          website_url = EXCLUDED.website_url,
          updated_at = now()
        RETURNING id, website_domain
      `;

      await tx`
        INSERT INTO provider_groups (name, cost_multiplier, description)
        VALUES (${PROVIDER_GROUP}, '1.0', 'Local portal test provider group')
        ON CONFLICT (name) DO UPDATE SET
          description = EXCLUDED.description,
          updated_at = now()
      `;

      const [existing] = await tx`
        SELECT id
        FROM providers
        WHERE name = ${PROVIDER_NAME}
          AND deleted_at IS NULL
        ORDER BY id ASC
        LIMIT 1
      `;

      let provider;
      if (existing) {
        [provider] = await tx`
          UPDATE providers SET
            url = ${PROVIDER_URL},
            key = ${PROVIDER_KEY},
            provider_vendor_id = ${vendor.id},
            is_enabled = true,
            weight = 1,
            priority = 0,
            cost_multiplier = '1.0',
            group_tag = ${PROVIDER_GROUP},
            provider_type = ${PROVIDER_TYPE},
            preserve_client_ip = false,
            disable_session_reuse = false,
            model_redirects = null,
            allowed_models = null,
            allowed_clients = '[]'::jsonb,
            blocked_clients = '[]'::jsonb,
            active_time_start = null,
            active_time_end = null,
            mcp_passthrough_type = 'none',
            mcp_passthrough_url = null,
            max_retry_attempts = null,
            proxy_url = null,
            proxy_fallback_to_direct = false,
            first_byte_timeout_streaming_ms = 0,
            streaming_idle_timeout_ms = 0,
            request_timeout_non_streaming_ms = 0,
            website_url = ${PROVIDER_URL},
            favicon_url = null,
            cache_ttl_preference = 'inherit',
            context_1m_preference = 'inherit',
            codex_reasoning_effort_preference = 'inherit',
            codex_reasoning_summary_preference = 'inherit',
            codex_text_verbosity_preference = 'inherit',
            codex_parallel_tool_calls_preference = 'inherit',
            codex_service_tier_preference = 'inherit',
            updated_at = now()
          WHERE id = ${existing.id}
          RETURNING id, name, url, provider_type, group_tag, is_enabled
        `;
      } else {
        [provider] = await tx`
          INSERT INTO providers (
            name,
            url,
            key,
            provider_vendor_id,
            is_enabled,
            weight,
            priority,
            cost_multiplier,
            group_tag,
            provider_type,
            preserve_client_ip,
            disable_session_reuse,
            model_redirects,
            allowed_models,
            allowed_clients,
            blocked_clients,
            active_time_start,
            active_time_end,
            mcp_passthrough_type,
            mcp_passthrough_url,
            max_retry_attempts,
            proxy_url,
            proxy_fallback_to_direct,
            first_byte_timeout_streaming_ms,
            streaming_idle_timeout_ms,
            request_timeout_non_streaming_ms,
            website_url,
            favicon_url,
            cache_ttl_preference,
            context_1m_preference,
            codex_reasoning_effort_preference,
            codex_reasoning_summary_preference,
            codex_text_verbosity_preference,
            codex_parallel_tool_calls_preference,
            codex_service_tier_preference
          )
          VALUES (
            ${PROVIDER_NAME},
            ${PROVIDER_URL},
            ${PROVIDER_KEY},
            ${vendor.id},
            true,
            1,
            0,
            '1.0',
            ${PROVIDER_GROUP},
            ${PROVIDER_TYPE},
            false,
            false,
            null,
            null,
            '[]'::jsonb,
            '[]'::jsonb,
            null,
            null,
            'none',
            null,
            null,
            null,
            false,
            0,
            0,
            0,
            ${PROVIDER_URL},
            null,
            'inherit',
            'inherit',
            'inherit',
            'inherit',
            'inherit',
            'inherit',
            'inherit'
          )
          RETURNING id, name, url, provider_type, group_tag, is_enabled
        `;
      }

      const [endpoint] = await tx`
        INSERT INTO provider_endpoints (
          vendor_id,
          provider_type,
          url,
          label,
          sort_order,
          is_enabled
        )
        VALUES (${vendor.id}, ${PROVIDER_TYPE}, ${PROVIDER_URL}, 'fkcodex remote CCH', 0, true)
        ON CONFLICT (vendor_id, provider_type, url) WHERE deleted_at IS NULL
        DO UPDATE SET
          label = EXCLUDED.label,
          sort_order = EXCLUDED.sort_order,
          is_enabled = true,
          updated_at = now()
        RETURNING id, vendor_id, provider_type, url, is_enabled
      `;

      return { vendor, provider, endpoint };
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          dsn: dsnInfo,
          provider: publicProvider(result.provider),
          endpoint: result.endpoint,
        },
        null,
        2
      )
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
