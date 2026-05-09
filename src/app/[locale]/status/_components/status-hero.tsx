"use client";

import { Activity } from "lucide-react";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { cn } from "@/lib/utils";
import type { DisplayState } from "../_lib/derive-display-state";

interface StatusHeroProps {
  siteTitle: string;
  heroPrimary: string;
  heroSecondary: string;
  generatedAtLabel: string;
  generatedAt: string | null;
  locale: string;
  timeZone: string;
  overallState: DisplayState;
  statusLabel: string;
}

function pillColor(state: DisplayState): { dot: string; ring: string; text: string } {
  switch (state) {
    case "failed":
      return { dot: "bg-rose-500", ring: "bg-rose-500", text: "text-rose-300" };
    case "degraded":
      return {
        dot: "bg-amber-500",
        ring: "bg-amber-500",
        text: "text-amber-200",
      };
    case "operational":
      return {
        dot: "bg-emerald-500",
        ring: "bg-emerald-500",
        text: "text-emerald-300",
      };
    default:
      return {
        dot: "bg-muted-foreground",
        ring: "bg-muted-foreground",
        text: "text-slate-400",
      };
  }
}

export function StatusHero({
  siteTitle,
  heroPrimary,
  heroSecondary,
  generatedAtLabel,
  generatedAt,
  locale,
  timeZone,
  overallState,
  statusLabel,
}: StatusHeroProps) {
  const colors = pillColor(overallState);
  const formattedGeneratedAt = generatedAt
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "medium",
        timeZone,
      }).format(new Date(generatedAt))
    : "—";

  return (
    <header className="cch-status-hero cch-status-glass rounded-3xl px-5 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="cch-status-icon-tile mt-1 flex size-11 shrink-0 items-center justify-center rounded-2xl backdrop-blur-sm">
            <Activity className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-semibold uppercase text-amber-200/80">{heroPrimary}</p>
            <h1 className="truncate text-2xl font-semibold text-slate-50 sm:text-3xl">
              {siteTitle}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-300">{heroSecondary}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div
            className={cn(
              "cch-status-chip flex items-center gap-2 rounded-full px-3 py-1.5 text-sm backdrop-blur-sm"
            )}
          >
            <span className="relative flex size-2.5">
              <span
                className={cn(
                  "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                  colors.ring
                )}
              />
              <span className={cn("relative inline-flex size-2.5 rounded-full", colors.dot)} />
            </span>
            <span className={cn("font-medium", colors.text)}>{statusLabel}</span>
            <span className="hidden text-slate-500 sm:inline">·</span>
            <span className="hidden font-mono text-xs text-slate-400 sm:inline">
              {generatedAtLabel} {formattedGeneratedAt}
            </span>
          </div>
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  );
}
