import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  GitBranch,
  History,
  RefreshCw,
} from "lucide-react";
import type { RepoSnapshot } from "../types";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Progress } from "./ui/progress";
import { ScrollArea } from "./ui/scroll-area";

interface Props {
  snapshot: RepoSnapshot | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  compact?: boolean;
}

const statusVariant: Record<
  string,
  "default" | "hg" | "git" | "accent" | "success" | "destructive"
> = {
  paths_missing: "default",
  hg_missing: "hg",
  git_missing: "git",
  never_imported: "accent",
  repo_mismatch: "destructive",
  in_sync: "success",
  behind: "git",
  ahead: "destructive",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "in_sync") {
    return <CheckCircle2 className="size-5 text-success" />;
  }
  if (status === "behind" || status === "never_imported") {
    return <History className="size-5 text-git" />;
  }
  if (status === "repo_mismatch" || status === "ahead") {
    return <AlertTriangle className="size-5 text-destructive" />;
  }
  return <RefreshCw className="size-5 text-muted-foreground" />;
}

function deltaLabel(status: string): string {
  switch (status) {
    case "synced":
      return "Synced";
    case "pending":
      return "Pending";
    case "hg_only":
      return "Hg only";
    case "git_only":
      return "Git only";
    case "unmapped":
      return "Unmapped";
    default:
      return status;
  }
}

export function SyncStatusCard({
  snapshot,
  onRefresh,
  refreshing,
  compact,
}: Props) {
  if (!snapshot) {
    return (
      <Card className="border-border/60 border-dashed bg-card/20">
        <CardContent className="text-ui-caption py-8 text-center">
          Set repository paths to analyze sync with Git.
        </CardContent>
      </Card>
    );
  }

  const sync = snapshot.sync;
  const showProgress =
    snapshot.hg.valid &&
    snapshot.git.valid &&
    sync.status !== "paths_missing" &&
    sync.hgTip > 0;

  return (
    <Card
      className={cn(
        "overflow-hidden border-border/60",
        sync.status === "behind" && "border-git/25",
        sync.status === "in_sync" && "border-success/20",
        sync.status === "repo_mismatch" && "border-destructive/25",
      )}
    >
      <CardHeader className="border-b border-border/50 bg-muted/10 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/50">
              <StatusIcon status={sync.status} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{sync.title}</CardTitle>
                <Badge variant={statusVariant[sync.status] ?? "default"}>
                  {sync.status.replace(/_/g, " ")}
                </Badge>
              </div>
              <CardDescription className="mt-1">
                {sync.summary}
              </CardDescription>
            </div>
          </div>
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={refreshing}
              onClick={onRefresh}
            >
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
              Refresh
            </Button>
          )}
        </div>

        {showProgress && (
          <div className="mt-2">
            <div className="text-ui-caption mb-1.5 flex justify-between tabular-nums">
              <span className="text-muted-foreground">Revision sync</span>
              <span>
                <span className="font-medium text-foreground">{sync.importedTip}</span>
                <span className="text-muted-foreground">
                  {" "}
                  / {sync.hgChangesetCount ?? sync.hgTip + 1} changesets
                </span>
                <span className="text-muted-foreground/70"> (tip r{sync.hgTip})</span>
                {sync.pendingRevisions > 0 && (
                  <span className="ml-2 text-git">+{sync.pendingRevisions} pending</span>
                )}
              </span>
            </div>
            <Progress
              value={sync.syncPercent}
              indicatorClassName="bg-gradient-to-r from-hg via-accent to-git"
            />
          </div>
        )}

        {sync.repoPathMismatch && sync.recordedHgRepo && (
          <p className="text-ui-mono text-ui-caption mt-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
            State recorded: {sync.recordedHgRepo}
          </p>
        )}
      </CardHeader>

      {!compact && (
        <CardContent className="grid gap-0 p-0 lg:grid-cols-2">
          {sync.pendingChangesets.length > 0 && (
            <div className="border-b border-border/50 lg:border-b-0 lg:border-r">
              <p className="text-ui-label border-b border-border/40 px-5 py-2.5 text-git">
                Pending in Mercurial ({sync.pendingChangesets.length}
                {sync.pendingRevisions > sync.pendingChangesets.length
                  ? ` of ${sync.pendingRevisions}`
                  : ""}
                )
              </p>
              <ScrollArea className="h-[min(220px,32vh)]">
                <ul className="divide-y divide-border/40 p-2">
                  {sync.pendingChangesets.map((cs) => (
                    <li
                      key={cs.rev}
                      className="flex gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/30"
                    >
                      <span className="text-ui-mono shrink-0 font-medium text-hg">
                        r{cs.rev}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{cs.summary || "(no message)"}</p>
                        <p className="text-ui-caption mt-0.5 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1">
                            <GitBranch className="size-3" />
                            {cs.branch}
                          </span>
                          <code>{cs.node}</code>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          )}

          {sync.branchDeltas.length > 0 && (
            <div>
              <p className="text-ui-label border-b border-border/40 px-5 py-2.5 text-accent">
                Branch delta
              </p>
              <ScrollArea
                className={cn(
                  "h-[min(220px,32vh)]",
                  sync.pendingChangesets.length === 0 && "lg:col-span-2",
                )}
              >
                <ul className="divide-y divide-border/40 p-2">
                  {sync.branchDeltas.map((b) => (
                    <li
                      key={b.name}
                      className="flex items-center gap-2 rounded-lg px-3 py-2.5"
                    >
                      <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
                      {b.hgRevision != null && (
                        <span className="text-ui-mono text-hg">r{b.hgRevision}</span>
                      )}
                      {b.gitTip && (
                        <>
                          <ArrowRight className="size-3 text-muted-foreground/50" />
                          <code className="text-ui-mono text-git">{b.gitTip}</code>
                        </>
                      )}
                      <Badge
                        variant={
                          b.status === "pending"
                            ? "git"
                            : b.status === "synced"
                              ? "success"
                              : b.status === "git_only"
                                ? "destructive"
                                : "default"
                        }
                        className="shrink-0"
                      >
                        {deltaLabel(b.status)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          )}

          {sync.pendingChangesets.length === 0 &&
            sync.branchDeltas.length === 0 &&
            sync.status === "in_sync" && (
              <p className="text-ui-caption col-span-full px-5 py-6 text-center">
                All named branches and revisions match the last import.
              </p>
            )}
        </CardContent>
      )}
    </Card>
  );
}
