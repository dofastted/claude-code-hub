import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isPublicStatusDevMockSearchParamValue } from "@/lib/public-status/dev-mock";
import { loadPublicStatusPageData } from "@/lib/public-status/public-api-loader";
import { PublicStatusView } from "../_components/public-status-view";

export const dynamic = "force-dynamic";

async function loadGroupContext(slug: string, mock?: string | string[]) {
  const loaded = await loadPublicStatusPageData({ groupSlug: slug, mock });
  const targetGroup = loaded.initialPayload.groups.find((group) => group.publicGroupSlug === slug);
  return { ...loaded, targetGroup };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ mock?: string | string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { siteTitle, targetGroup } = await loadGroupContext(slug, (await searchParams)?.mock);
  if (!targetGroup) {
    return { title: siteTitle };
  }
  return {
    title: `${targetGroup.displayName} · ${siteTitle}`,
    description: targetGroup.explanatoryCopy ?? undefined,
  };
}

export default async function PublicStatusGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams?: Promise<{ mock?: string | string[] }>;
}) {
  const { locale, slug } = await params;
  const mock = isPublicStatusDevMockSearchParamValue((await searchParams)?.mock);
  const t = await getTranslations({ locale, namespace: "settings" });
  const {
    followServerDefaults,
    initialPayload,
    intervalMinutes,
    rangeHours,
    siteTitle,
    status,
    timeZone,
    targetGroup,
  } = await loadGroupContext(slug, mock ? "1" : undefined);
  if (!targetGroup) {
    notFound();
  }

  const filteredPayload = { ...initialPayload, groups: [targetGroup] };

  return (
    <PublicStatusView
      initialPayload={filteredPayload}
      intervalMinutes={intervalMinutes}
      rangeHours={rangeHours}
      followServerDefaults={followServerDefaults}
      filterSlug={slug}
      initialStatus={status}
      locale={locale}
      mock={mock}
      siteTitle={siteTitle}
      timeZone={timeZone}
      labels={{
        systemStatus: t("statusPage.public.systemStatus"),
        heroPrimary: t("statusPage.public.heroPrimary"),
        heroSecondary: t("statusPage.public.heroSecondary"),
        generatedAt: t("statusPage.public.generatedAt"),
        history: t("statusPage.public.history"),
        availability: t("statusPage.public.availability"),
        ttfb: t("statusPage.public.ttfb"),
        freshnessWindow: t("statusPage.public.freshnessWindow"),
        fresh: t("statusPage.public.fresh"),
        stale: t("statusPage.public.stale"),
        staleDetail: t("statusPage.public.staleDetail"),
        rebuilding: t("statusPage.public.rebuilding"),
        noSnapshot: t("statusPage.public.noSnapshot"),
        noData: t("statusPage.public.noData"),
        emptyDescription: t("statusPage.public.emptyDescription"),
        requestTypes: {
          openaiCompatible: t("statusPage.public.requestTypes.openaiCompatible"),
          codex: t("statusPage.public.requestTypes.codex"),
          anthropic: t("statusPage.public.requestTypes.anthropic"),
          gemini: t("statusPage.public.requestTypes.gemini"),
        },
        statusBadge: {
          operational: t("statusPage.public.statusBadge.operational"),
          degraded: t("statusPage.public.statusBadge.degraded"),
          failed: t("statusPage.public.statusBadge.failed"),
          noData: t("statusPage.public.statusBadge.noData"),
        },
        tooltip: {
          availability: t("statusPage.public.tooltip.availability"),
          ttfb: t("statusPage.public.tooltip.ttfb"),
          tps: t("statusPage.public.tooltip.tps"),
          historyAriaLabel: t("statusPage.public.tooltip.historyAriaLabel"),
        },
        searchPlaceholder: t("statusPage.public.searchPlaceholder"),
        customSort: t("statusPage.public.customSort"),
        resetSort: t("statusPage.public.resetSort"),
        emptyByFilter: t("statusPage.public.emptyByFilter"),
        modelsLabel: t("statusPage.public.modelsLabel"),
        issuesLabel: t("statusPage.public.issuesLabel"),
        clearSearch: t("statusPage.public.clearSearch"),
        dragHandle: t("statusPage.public.dragHandle"),
        toggleGroup: t("statusPage.public.toggleGroup"),
        openGroupPage: t("statusPage.public.openGroupPage"),
      }}
    />
  );
}
