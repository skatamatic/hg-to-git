import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  CircleOff,
  GitBranch,
} from "lucide-react";
import { useEffect, useRef } from "react";
import {
  rowExpandedClass,
  rowHoverClass,
  rowSurfaceClass,
  statusBadgeVariant,
  statusLabel,
  type AlignedBranchRow,
} from "../lib/branchAlign";
import { branchRowGridClass, branchRowPaddingClass } from "../lib/branchGrid";
import type { BranchHistoryResult } from "../types";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { BranchCommitHistory } from "./BranchCommitHistory";

function formatCommitMeta(
  revision?: number,
  tip?: string,
  commitCount?: number,
  pending?: boolean,
): string | undefined {
  const parts: string[] = [];
  if (commitCount != null) {
    parts.push(`${commitCount} commit${commitCount === 1 ? "" : "s"}`);
  }
  if (revision != null) {
    parts.push(`r${revision}${pending ? " · pending" : ""}`);
  } else if (tip) {
    parts.push(tip);
  }
  return parts.length ? parts.join(" · ") : undefined;
}

function missingBranchLabel(side: "hg" | "git", compact?: boolean): string {
  if (side === "hg") {
    return compact ? "No Hg branch" : "No Mercurial branch";
  }
  return "No Git branch";
}

function MissingBranchCell({
  side,
  compact,
}: {
  side: "hg" | "git";
  compact?: boolean;
}) {
  const label = missingBranchLabel(side, compact);
  return (
    <div
      className={cn(
        "flex min-w-0 items-center justify-center gap-1.5 rounded border border-dashed px-2 text-center",
        compact ? "min-h-[28px] py-1" : "min-h-[36px] py-2",
        side === "hg"
          ? "border-hg/30 bg-hg-muted/8"
          : "border-git/30 bg-git-muted/8",
      )}
      aria-label={label}
    >
      <CircleOff
        className={cn(
          "size-3 shrink-0",
          side === "hg" ? "text-hg/45" : "text-git/45",
        )}
        aria-hidden
      />
      <span className="text-ui-caption font-medium leading-tight text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function BranchSideCell({
  side,
  name,
  meta,
  empty,
  compact,
  stacked,
}: {
  side: "hg" | "git";
  name?: string;
  meta?: string;
  empty?: boolean;
  compact?: boolean;
  stacked?: boolean;
}) {
  if (empty || !name) {
    return <MissingBranchCell side={side} compact={compact} />;
  }

  if (stacked) {
    return (
      <div
        className={cn(
          "min-w-0 rounded px-1.5 py-1",
          compact ? "min-h-[28px]" : "min-h-[36px]",
          side === "hg" ? "bg-hg-muted/15" : "bg-git-muted/15",
        )}
      >
        <div className="flex min-w-0 items-center gap-1">
          <GitBranch
            className={cn(
              "size-3 shrink-0",
              side === "hg" ? "text-hg" : "text-git",
            )}
          />
          <span className="min-w-0 truncate font-medium" title={name}>
            {name}
          </span>
        </div>
        {meta && (
          <p className="text-ui-mono truncate pl-4 tabular-nums text-muted-foreground">
            {meta}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded px-1.5",
        compact ? "min-h-[28px] py-1" : "min-h-[36px] py-2",
        side === "hg" ? "bg-hg-muted/15" : "bg-git-muted/15",
      )}
    >
      <GitBranch
        className={cn("size-3 shrink-0", side === "hg" ? "text-hg" : "text-git")}
      />
      <div className="min-w-0 flex-1">
        <span className="block truncate font-medium" title={name}>
          {name}
        </span>
        {meta && (
          <span className="text-ui-mono block truncate tabular-nums text-muted-foreground">
            {meta}
          </span>
        )}
      </div>
    </div>
  );
}

export function BranchAlignedRow({
  row,
  compact,
  sidebar,
  expandable,
  expanded,
  onToggleExpand,
  history,
  historyLoading,
  loadMorePending,
  onLoadMore,
}: {
  row: AlignedBranchRow;
  compact?: boolean;
  sidebar?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  history?: BranchHistoryResult | null;
  historyLoading?: boolean;
  loadMorePending?: boolean;
  onLoadMore?: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mapped = row.hg && row.git && row.hg.name !== row.git.name;
  const stacked = Boolean(compact && sidebar);
  const canExpand = expandable && Boolean(row.hg || row.git);

  useEffect(() => {
    if (expanded && wrapperRef.current) {
      wrapperRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [expanded]);

  const hgMeta = formatCommitMeta(
    row.hg?.revision,
    row.hg?.tip,
    row.hg?.commitCount,
    row.status === "pending",
  );
  const gitMeta = formatCommitMeta(undefined, row.git?.tip, row.git?.commitCount);

  const header = (
    <div
      className={cn(
        "grid items-stretch",
        branchRowGridClass(compact, sidebar),
        branchRowPaddingClass(compact, sidebar),
        rowSurfaceClass(row.status),
        expanded && rowExpandedClass(row.status),
        canExpand && "cursor-pointer",
        canExpand && rowHoverClass(row.status),
      )}
      role={canExpand ? "button" : undefined}
      tabIndex={canExpand ? 0 : undefined}
      aria-expanded={canExpand ? expanded : undefined}
      onClick={canExpand ? onToggleExpand : undefined}
      onKeyDown={
        canExpand
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggleExpand?.();
              }
            }
          : undefined
      }
    >
      <div className="flex min-w-0 items-center gap-0.5">
        {canExpand && (
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
              expanded && "rotate-90",
            )}
          />
        )}
        <div className="min-w-0 flex-1">
          <BranchSideCell
            side="hg"
            name={row.hg?.name}
            meta={hgMeta}
            empty={!row.hg}
            compact={compact}
            stacked={stacked}
          />
        </div>
      </div>

      <div className="flex items-center justify-center" aria-hidden>
        {row.hg && row.git ? (
          <ArrowRight
            className={cn(
              "size-3 shrink-0",
              row.status === "synced" ? "text-success/70" : "text-warning",
            )}
          />
        ) : row.hg && !row.git ? (
          <ArrowRight className="size-3 shrink-0 text-hg/50" />
        ) : row.git && !row.hg ? (
          <ArrowLeft className="size-3 shrink-0 text-git/50" />
        ) : null}
      </div>

      <BranchSideCell
        side="git"
        name={row.git?.name}
        meta={gitMeta}
        empty={!row.git}
        compact={compact}
        stacked={stacked}
      />

      <div className="flex flex-col items-end justify-center gap-0.5">
        <Badge
          variant={statusBadgeVariant(row.status)}
          className="h-5 justify-center px-1.5"
        >
          {statusLabel(row.status)}
        </Badge>
        {mapped && !compact && (
          <span className="text-ui-caption">renamed</span>
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={wrapperRef}
      className="border-b border-border/30 last:border-b-0"
    >
      {header}
      {canExpand && (
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-out motion-safe:transition-[grid-template-rows,opacity]",
            expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-90",
          )}
        >
          <div className="overflow-hidden">
            <BranchCommitHistory
              history={expanded ? history ?? null : null}
              loading={expanded && historyLoading}
              compact={compact}
              onLoadMore={expanded ? onLoadMore : undefined}
              loadMorePending={loadMorePending}
            />
          </div>
        </div>
      )}
    </div>
  );
}
