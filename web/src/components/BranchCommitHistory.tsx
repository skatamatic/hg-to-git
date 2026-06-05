import { ArrowRight, Loader2 } from "lucide-react";
import type { AlignedCommitPair, BranchHistoryResult } from "../types";
import { branchRowGridClass } from "../lib/branchGrid";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

const COMMIT_INDENT = "ml-4 border-l-2 pl-3";

function CommitTags({
  tags,
  side,
}: {
  tags: string[];
  side: "hg" | "git";
}) {
  if (tags.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant={side === "hg" ? "hg" : "git"}
          className="h-4 px-1.5 text-[length:var(--text-ui-sm)] font-normal"
        >
          {tag}
        </Badge>
      ))}
    </div>
  );
}

function CommitCell({
  side,
  commit,
  paired,
}: {
  side: "hg" | "git";
  commit: AlignedCommitPair["hg"];
  paired: boolean;
}) {
  if (!commit) {
    return (
      <div
        className={cn(
          COMMIT_INDENT,
          "min-h-[2.5rem] rounded border border-dashed",
          side === "hg" ? "border-hg/25 bg-hg-muted/5" : "border-git/25 bg-git-muted/5",
        )}
        aria-hidden
      />
    );
  }

  return (
    <div
      className={cn(
        COMMIT_INDENT,
        "min-h-[2.5rem] rounded py-1.5",
        side === "hg" ? "border-hg/30 bg-hg-muted/12" : "border-git/30 bg-git-muted/12",
        paired && "ring-1 ring-inset ring-success/15",
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-ui-mono shrink-0 tabular-nums text-muted-foreground">
          {commit.revision != null ? `r${commit.revision}` : commit.sha}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium" title={commit.message}>
          {commit.message || "(no message)"}
        </span>
      </div>
      <p
        className="text-ui-caption truncate text-muted-foreground"
        title={commit.author}
      >
        {commit.author || "Unknown author"}
      </p>
      {commit.tags && commit.tags.length > 0 ? (
        <CommitTags tags={commit.tags} side={side} />
      ) : null}
    </div>
  );
}

interface Props {
  history: BranchHistoryResult | null;
  loading?: boolean;
  compact?: boolean;
  onLoadMore?: () => void;
  loadMorePending?: boolean;
}

export function BranchCommitHistory({
  history,
  loading,
  compact,
  onLoadMore,
  loadMorePending,
}: Props) {
  const colClass = branchRowGridClass(compact);
  const padClass = compact ? "px-2" : "px-3";

  if (loading && !history) {
    return (
      <div className={cn("grid py-4", colClass, padClass)}>
        <div className="col-span-4 flex items-center justify-center gap-2 text-ui-caption text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Loading commits…
        </div>
      </div>
    );
  }

  if (!history || history.pairs.length === 0) {
    return (
      <div className={cn("grid py-3", colClass, padClass)}>
        <p className="col-span-4 text-center text-ui-caption text-muted-foreground">
          No commits on this branch.
        </p>
      </div>
    );
  }

  const hasMore = history.hasMoreHg || history.hasMoreGit;

  return (
    <div className="border-t border-border/40 bg-muted/10">
      <div className={cn("py-1.5", padClass)}>
        {history.pairs.map((pair, i) => {
          const paired = Boolean(pair.hg && pair.git);
          return (
            <div
              key={`${pair.hg?.revision ?? pair.hg?.sha ?? "g"}-${pair.git?.sha ?? "h"}-${i}`}
              className={cn(
                "grid items-stretch py-0.5",
                colClass,
                !paired && (pair.hg || pair.git) && "bg-warning/[0.04]",
              )}
            >
              <CommitCell side="hg" commit={pair.hg} paired={paired} />
              <div className="flex items-center justify-center self-center" aria-hidden>
                {paired ? (
                  <ArrowRight className="size-3 shrink-0 text-success/70" />
                ) : (
                  <span className="text-ui-caption text-warning/70">≠</span>
                )}
              </div>
              <CommitCell side="git" commit={pair.git} paired={paired} />
              <div />
            </div>
          );
        })}
      </div>
      {hasMore && onLoadMore && (
        <div className={cn("border-t border-border/30 pb-2 pt-1", padClass)}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-full text-ui-caption"
            disabled={loadMorePending}
            onClick={onLoadMore}
          >
            {loadMorePending ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                Loading…
              </>
            ) : (
              "Show more commits"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
