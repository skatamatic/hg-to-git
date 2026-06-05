import { ArrowRight, GitBranch, GitFork } from "lucide-react";
import { useCallback, useState } from "react";
import { fetchBranchHistory } from "../api";
import type { BranchHistoryResult, RepoSnapshot } from "../types";
import { buildAlignedBranchRows, countBranchIssues, type AlignedBranchRow } from "../lib/branchAlign";
import { BranchAlignedRow } from "./BranchAlignedRow";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";

interface Props {
  snapshot: RepoSnapshot | null;
  hgPath?: string;
  gitPath?: string;
  dense?: boolean;
  fill?: boolean;
  /** Minimal header for Simple Mode (branch table only). */
  simple?: boolean;
  /** Expandable commit history (Run view). */
  expandable?: boolean;
  defaultBranch?: string;
}

const COMMITS_PAGE = 10;

function EmptyPipeline({ hgPath, gitPath }: { hgPath?: string; gitPath?: string }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-8 flex items-center gap-3 sm:gap-5">
        <div className="flex flex-col items-center gap-2">
          <div className="flex size-14 items-center justify-center rounded-2xl border border-hg/30 bg-hg-muted/30 shadow-[0_0_40px_rgba(20,184,166,0.12)]">
            <GitBranch className="size-6 text-hg" />
          </div>
          <span className="text-ui-label text-hg">Mercurial</span>
        </div>

        <div className="flex flex-col items-center gap-1 px-2">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-1 rounded-full bg-accent/40"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
          <ArrowRight className="size-5 text-accent/60" />
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="flex size-14 items-center justify-center rounded-2xl border border-git/30 bg-git-muted/30 shadow-[0_0_40px_rgba(232,121,249,0.1)]">
            <GitFork className="size-6 text-git" />
          </div>
          <span className="text-ui-label text-git">Git</span>
        </div>
      </div>

      <h3 className="text-ui-heading">Branch topology will appear here</h3>
      <p className="text-ui-caption mt-2 max-w-md">
        Point to valid local clones, then refresh. You will see named branches,
        mapped heads, and sync progress between repositories.
      </p>

      {(hgPath || gitPath) && (
        <div className="mt-6 w-full max-w-lg space-y-2 rounded-xl border border-border/60 bg-muted/20 p-4 text-left">
          {hgPath && (
            <p className="text-ui-mono truncate text-muted-foreground">
              <span className="text-hg">hg</span> {hgPath}
            </p>
          )}
          {gitPath && (
            <p className="text-ui-mono truncate text-muted-foreground">
              <span className="text-git">git</span> {gitPath}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function BranchMap({
  snapshot,
  hgPath,
  gitPath,
  dense,
  fill,
  simple,
  expandable = false,
  defaultBranch = "master",
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyByRow, setHistoryByRow] = useState<Record<string, BranchHistoryResult>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [loadMoreId, setLoadMoreId] = useState<string | null>(null);

  const loadHistory = useCallback(
    async (row: AlignedBranchRow, offset: number, append: boolean) => {
      if (!hgPath || !gitPath) return;
      const key = row.id;
      if (append) setLoadMoreId(key);
      else setLoadingId(key);
      try {
        const next = await fetchBranchHistory(hgPath, gitPath, {
          hgBranch: row.hg?.name,
          gitBranch: row.git?.name,
          defaultBranch,
          limit: COMMITS_PAGE,
          offset,
        });
        setHistoryByRow((prev) => {
          if (!append || !prev[key]) return { ...prev, [key]: next };
          return {
            ...prev,
            [key]: {
              ...next,
              pairs: [...prev[key].pairs, ...next.pairs],
            },
          };
        });
      } finally {
        setLoadingId(null);
        setLoadMoreId(null);
      }
    },
    [hgPath, gitPath, defaultBranch],
  );

  const handleToggle = useCallback(
    (row: AlignedBranchRow) => {
      if (expandedId === row.id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(row.id);
      if (!historyByRow[row.id]) {
        void loadHistory(row, 0, false);
      }
    },
    [expandedId, historyByRow, loadHistory],
  );
  if (!snapshot?.hg.valid && !snapshot?.git.valid) {
    return (
      <Card
        className={cn(
          "overflow-hidden border-border",
          fill && "flex min-h-0 flex-1 items-center justify-center",
        )}
      >
        <EmptyPipeline hgPath={hgPath} gitPath={gitPath} />
      </Card>
    );
  }

  const hgBranches = snapshot.hg.branches;
  const gitBranches = snapshot.git.branches;
  const alignedRows = buildAlignedBranchRows(snapshot);
  const issueCount = countBranchIssues(alignedRows);

  const scrollClass = fill
    ? "min-h-0 flex-1"
    : dense
      ? "h-[min(180px,24vh)]"
      : "h-[min(300px,38vh)]";

  return (
    <Card
      className={cn(
        "flex min-h-0 flex-col overflow-hidden border-border/60",
        fill && "h-full flex-1",
      )}
    >
      <CardHeader
        className={cn(
          "shrink-0 border-b border-border bg-muted",
          simple ? "py-2 px-3" : dense ? "space-y-2 py-2.5 px-3" : "pb-4",
        )}
      >
        {simple ? (
          <p className="text-ui-label">Branches</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className={dense ? "text-ui-title" : undefined}>
              Branches
            </CardTitle>
            {!dense && (
              <CardDescription className="mt-0">Hg ↔ Git (aligned)</CardDescription>
            )}
            <Badge variant="hg">{hgBranches.length} hg</Badge>
            <Badge variant="git">{gitBranches.length} git</Badge>
            {issueCount > 0 ? (
              <Badge variant="warning">
                {issueCount} {issueCount === 1 ? "issue" : "issues"}
              </Badge>
            ) : (
              alignedRows.length > 0 && (
                <Badge variant="success">All synced</Badge>
              )
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <div
          className={cn(
            "grid shrink-0 border-b border-border/50 bg-muted/30 text-ui-label",
            dense
              ? "grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)_72px] gap-1.5 px-2 py-1.5"
              : "grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)_84px] gap-2 px-3 py-2",
          )}
        >
          <span className="text-hg">Mercurial</span>
          <span className="text-center" aria-hidden>
            ·
          </span>
          <span className="text-git">Git</span>
          <span className="text-right">Status</span>
        </div>

        <ScrollArea className={scrollClass}>
          {alignedRows.length === 0 ? (
            <p className="text-ui-caption py-10 text-center">
              {snapshot.hg.valid
                ? "No branch differences to show."
                : "Set valid repository paths."}
            </p>
          ) : (
            <div className="py-0.5">
              {alignedRows.map((row) => {
                const hist = historyByRow[row.id];
                const rowWithCounts = {
                  ...row,
                  hg: row.hg
                    ? {
                        ...row.hg,
                        commitCount: hist?.hgTotal ?? row.hg.commitCount,
                      }
                    : null,
                  git: row.git
                    ? {
                        ...row.git,
                        commitCount: hist?.gitTotal ?? row.git.commitCount,
                      }
                    : null,
                };
                return (
                  <BranchAlignedRow
                    key={row.id}
                    row={rowWithCounts}
                    compact={dense}
                    expandable={expandable}
                    expanded={expandable && expandedId === row.id}
                    onToggleExpand={() => handleToggle(row)}
                    history={hist}
                    historyLoading={loadingId === row.id}
                    loadMorePending={loadMoreId === row.id}
                    onLoadMore={() => {
                      const offset =
                        (hist?.offset ?? 0) + (hist?.limit ?? COMMITS_PAGE);
                      void loadHistory(row, offset, true);
                    }}
                  />
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
