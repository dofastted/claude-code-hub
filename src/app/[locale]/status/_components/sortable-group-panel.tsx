"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ExternalLink, GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Link } from "@/i18n/routing";
import { cn } from "@/lib/utils";

interface SortableGroupPanelProps {
  slug: string;
  displayName: string;
  explanatoryCopy?: string | null;
  modelCount: number;
  issueCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draggable: boolean;
  children: ReactNode;
  issueBadgeLabel?: string;
  modelBadgeLabel?: string;
  dragHandleLabel?: string;
  toggleLabel?: string;
  groupHref?: string;
  groupLinkLabel?: string;
}

export function SortableGroupPanel({
  slug,
  displayName,
  explanatoryCopy,
  modelCount,
  issueCount,
  open,
  onOpenChange,
  draggable,
  children,
  issueBadgeLabel,
  modelBadgeLabel,
  dragHandleLabel,
  toggleLabel,
  groupHref,
  groupLinkLabel,
}: SortableGroupPanelProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slug,
    disabled: !draggable,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={cn(
        "cch-status-panel rounded-2xl p-4 backdrop-blur-sm sm:p-5",
        isDragging && "ring-2 ring-amber-400/70"
      )}
    >
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <div className="flex items-center gap-2">
          {draggable ? (
            <button
              type="button"
              className="cch-status-focus flex size-11 cursor-grab items-center justify-center rounded-lg text-slate-400 hover:bg-amber-400/10 hover:text-amber-200 active:cursor-grabbing sm:size-9"
              aria-label={dragHandleLabel ?? displayName}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onOpenChange(!open)}
            aria-label={toggleLabel ?? displayName}
            aria-expanded={open}
            className="cch-status-focus flex size-11 items-center justify-center rounded-lg text-slate-400 hover:bg-amber-400/10 hover:text-amber-200 sm:size-9"
          >
            <ChevronDown
              className={cn(
                "size-4 shrink-0 transition-transform duration-200",
                open ? "rotate-0" : "-rotate-90"
              )}
            />
          </button>
          {groupHref ? (
            <Link
              href={groupHref}
              className="cch-status-focus min-w-0 flex-1 truncate rounded-lg px-1 py-1 text-lg font-semibold text-slate-50 transition-colors hover:text-amber-200 sm:text-xl"
            >
              {displayName}
            </Link>
          ) : (
            <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-slate-50 sm:text-xl">
              {displayName}
            </h2>
          )}
          <span className="ml-auto flex flex-shrink-0 items-center gap-2 text-xs text-slate-400">
            {modelBadgeLabel ? (
              <span className="cch-status-chip rounded-lg px-2 py-1">
                {modelCount} {modelBadgeLabel}
              </span>
            ) : null}
            {issueCount > 0 && issueBadgeLabel ? (
              <span className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-rose-200">
                {issueCount} {issueBadgeLabel}
              </span>
            ) : null}
            {groupHref ? (
              <Link
                href={groupHref}
                aria-label={groupLinkLabel ?? displayName}
                className="cch-status-focus flex size-11 items-center justify-center rounded-lg text-slate-400 hover:bg-amber-400/10 hover:text-amber-200 sm:size-9"
              >
                <ExternalLink className="size-4" />
              </Link>
            ) : null}
          </span>
        </div>
        {explanatoryCopy ? (
          <p className="mt-1 pl-8 text-xs leading-5 text-slate-400">{explanatoryCopy}</p>
        ) : null}
        <CollapsibleContent className="pt-4">{children}</CollapsibleContent>
      </Collapsible>
    </section>
  );
}
