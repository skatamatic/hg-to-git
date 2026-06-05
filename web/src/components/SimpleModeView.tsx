import {

  AlertTriangle,

  CheckCircle2,

  Loader2,

  Play,

  RefreshCw,

  Settings2,

} from "lucide-react";

import type { Project, RepoSnapshot } from "../types";

import {

  canSyncInSimpleMode,

  getSimpleModeProblems,

  simpleSyncDisplay,

} from "../lib/simpleMode";

import { BranchMap } from "./BranchMap";

import { UI_COPY } from "../lib/uiCopy";
import { cn } from "../lib/utils";

import { Badge } from "./ui/badge";

import { Button } from "./ui/button";

import { Progress } from "./ui/progress";



interface Props {

  project: Project;

  snapshot: RepoSnapshot | null;

  snapshotRefreshing?: boolean;

  running?: boolean;

  runStatus?: "idle" | "running" | "success" | "error";

  percent?: number;

  progressLabel?: string;

  revisionsImported?: number;

  onSync: () => void;

  onRefresh: () => void;

  onExitSimpleMode: () => void;

}



export function SimpleModeView({

  project,

  snapshot,

  snapshotRefreshing,

  running,

  runStatus = "idle",

  percent = 0,

  progressLabel,

  revisionsImported,

  onSync,

  onRefresh,

  onExitSimpleMode,

}: Props) {

  const problems = getSimpleModeProblems(snapshot);

  const display = simpleSyncDisplay(snapshot, problems);

  const canSync = canSyncInSimpleMode(snapshot, problems, running ?? false);

  const sync = snapshot?.sync;

  const isRunning = running || runStatus === "running";

  const historyTotal = sync?.hgChangesetCount ?? (sync ? sync.hgTip + 1 : 0);

  const showHistory =

    snapshot?.hg.valid &&

    snapshot?.git.valid &&

    sync &&

    sync.hgTip > 0 &&

    sync.status !== "never_imported";



  return (

    <div className="flex h-full min-h-0 flex-col overflow-hidden">

      <header className="workbench-chrome flex h-[var(--toolbar-height)] shrink-0 items-center gap-3 border-b px-3">

        <h2 className="text-ui-title shrink-0">Simple</h2>

        <span className="min-w-0 truncate text-ui-caption">{project.name}</span>

        <Button

          variant="ghost"

          size="sm"

          className="ml-auto h-7 px-2"

          disabled={isRunning || snapshotRefreshing}

          onClick={() => onRefresh()}

          title={UI_COPY.refresh}

        >

          <RefreshCw

            className={cn("size-3.5", snapshotRefreshing && "animate-spin")}

          />

        </Button>

      </header>



      {problems.length > 0 ? (

        <div

          className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-4 py-2.5"

          role="alert"

        >

          <div className="flex flex-wrap items-start gap-3">

            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />

            <div className="min-w-0 flex-1 space-y-2">

              {problems.map((p) => (

                <div key={p.id}>

                  <p className="font-medium text-foreground">{p.title}</p>

                  <p className="text-ui-caption">{p.detail}</p>

                </div>

              ))}

            </div>

            <Button

              variant="outline"

              size="sm"

              className="h-7 shrink-0 gap-1.5"

              disabled={isRunning}

              onClick={onExitSimpleMode}

            >

              <Settings2 className="size-3.5" />

              Full setup

            </Button>

          </div>

        </div>

      ) : isRunning ? (

        <section

          className={cn(

            "relative shrink-0 overflow-hidden border-b border-accent/30 px-4 py-5",

            "bg-elevated",

          )}

        >

          <div

            className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(6,182,212,0.06),transparent)] motion-safe:animate-pulse"

            aria-hidden

          />

          <div className="relative mx-auto max-w-lg">

            <div className="flex items-center gap-2">

              <Loader2 className="size-5 shrink-0 animate-spin text-accent" />

              <h3 className="text-ui-heading">Syncing</h3>

              <Badge variant="accent">Live</Badge>

            </div>

            <p className="text-ui-mono mt-1 truncate text-muted-foreground">

              {progressLabel || "Importing Mercurial history…"}

            </p>

            <div className="mt-4 flex items-center gap-3">

              <Progress

                value={percent}

                className="h-2 min-w-0 flex-1"

                indicatorClassName="bg-gradient-to-r from-hg via-accent to-git"

              />

              <span className="text-ui-mono shrink-0 tabular-nums text-foreground">

                {percent}%

              </span>

            </div>

          </div>

        </section>

      ) : display === "in_sync" ? (

        <section className="shrink-0 border-b border-success/25 bg-success/5 px-4 py-6 sm:py-7">

          <div className="mx-auto flex max-w-lg flex-col items-center text-center">

            <div className="mb-3 flex size-11 items-center justify-center rounded-lg border border-success/30 bg-success/10">

              <CheckCircle2 className="size-6 text-success" strokeWidth={2} />

            </div>

            <h3 className="text-ui-heading text-success">In sync</h3>

            <p className="text-ui-caption mt-2 max-w-md">
              {UI_COPY.repositoriesInSync}
            </p>

            {showHistory && (

              <p className="text-ui-mono mt-3 tabular-nums text-muted-foreground">

                <span className="text-foreground">{sync.importedTip}</span>

                <span> / {historyTotal} changesets</span>

                <span className="mx-2 text-border">·</span>

                <span className="text-hg">{snapshot.hg.branches.length} hg</span>

                <span className="text-muted-foreground/60"> · </span>

                <span className="text-git">{snapshot.git.branches.length} git</span>

              </p>

            )}

            {runStatus === "success" &&

              revisionsImported != null &&

              revisionsImported > 0 && (

                <Badge variant="success" className="mt-3">

                  +{revisionsImported} imported this run

                </Badge>

              )}

          </div>

        </section>

      ) : display === "not_in_sync" ? (

        <section className="shrink-0 border-b border-git/20 bg-git-muted/10 px-4 py-6 sm:py-7">

          <div className="mx-auto flex max-w-lg flex-col items-center text-center">

            <h3 className="text-ui-heading">Not in sync</h3>

            <p className="text-ui-caption mt-2">
              {sync?.pendingRevisions
                ? `${sync.pendingRevisions} revision${sync.pendingRevisions === 1 ? "" : "s"} to import.`
                : "New Mercurial changes can be imported."}
            </p>

            {canSync && (

              <Button size="lg" className="mt-5 min-w-[200px] gap-2" onClick={onSync}>

                <Play className="size-4 fill-current" />

                Sync

              </Button>

            )}

          </div>

        </section>

      ) : (

        <section className="shrink-0 border-b border-border bg-muted/30 px-4 py-4 text-center">

          <p className="text-ui-caption">

            {snapshot

              ? "Refresh to check sync status."

              : "Configure repositories in full setup, then return here."}

          </p>

        </section>

      )}



      <div className="flex min-h-0 flex-1 flex-col p-3">

        <BranchMap

          simple

          fill

          dense

          snapshot={snapshot}

          hgPath={project.hgRepo}

          gitPath={project.gitRepo}

        />

      </div>

    </div>

  );

}

