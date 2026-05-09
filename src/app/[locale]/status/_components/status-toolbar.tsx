"use client";

import { ArrowDownAZ, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface StatusToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  customSort: boolean;
  onToggleCustomSort: () => void;
  searchPlaceholder: string;
  customSortLabel: string;
  resetSortLabel: string;
  clearSearchLabel: string;
}

export function StatusToolbar({
  searchQuery,
  onSearchChange,
  customSort,
  onToggleCustomSort,
  searchPlaceholder,
  customSortLabel,
  resetSortLabel,
  clearSearchLabel,
}: StatusToolbarProps) {
  return (
    <div className="cch-status-glass flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          className="cch-status-input cch-status-focus h-11 rounded-xl pl-9 pr-12 shadow-none sm:h-10"
          aria-label={searchPlaceholder}
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="cch-status-focus absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-amber-400/10 hover:text-amber-200 sm:size-8"
            aria-label={clearSearchLabel}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      <Button
        type="button"
        variant={customSort ? "default" : "outline"}
        size="sm"
        onClick={onToggleCustomSort}
        className={cn(
          "cch-status-focus min-h-11 gap-1.5 self-start rounded-xl border-amber-400/30 px-3 text-slate-100 shadow-none sm:min-h-10 sm:self-auto",
          customSort
            ? "bg-amber-500 text-slate-950 hover:bg-amber-400"
            : "bg-slate-950/40 hover:bg-amber-400/10 hover:text-amber-100"
        )}
      >
        <ArrowDownAZ className="size-4" />
        {customSort ? resetSortLabel : customSortLabel}
      </Button>
    </div>
  );
}
