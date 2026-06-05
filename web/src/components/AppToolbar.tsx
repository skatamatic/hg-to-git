import { Play, RefreshCw } from "lucide-react";
import type { AppView, Project, RepoSnapshot } from "../types";
import { useInputsLocked } from "../lib/inputsLocked";
import { REPOSITORIES_IN_SYNC, UI_COPY } from "../lib/uiCopy";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";

interface Props {
  view: AppView;
  activeProject: Project | null;
  snapshot?: RepoSnapshot | null;
  running?: boolean;
  canRun?: boolean;
  runNotice?: string | null;
  onUpdateProject?: (partial: Partial<Project>) => void;
  onConvert?: () => void;
  onRefresh?: () => void;
  snapshotRefreshing?: boolean;
}

const viewTitles: Record<AppView, string> = {
  setup: "Setup",
  results: "Run",
};

function runBlockedBySync(snapshot: RepoSnapshot | null | undefined): boolean {
  return (
    snapshot?.hg.valid === true &&
    snapshot?.git.valid === true &&
    snapshot.sync.status === "in_sync"
  );
}

export function AppToolbar({
  view,
  activeProject,
  snapshot,
  running = false,
  canRun = false,
  runNotice,
  onUpdateProject,
  onConvert,
  onRefresh,
  snapshotRefreshing,
}: Props) {
  const inputsLocked = useInputsLocked();
  const inSync = runBlockedBySync(snapshot);
  const runBusy = running || snapshotRefreshing;
  const runDisabled = !canRun || runBusy || inSync;
  const runTooltip = inSync ? UI_COPY.repositoriesInSync : undefined;

  const runButton = (
    <Button
      size="sm"
      className="h-7 min-w-[4.25rem] px-3 active:scale-100"
      disabled={runDisabled}
      onClick={onConvert}
    >
      <span className="inline-flex items-center justify-center gap-1 leading-none">
        {running ? (
          <RefreshCw className="size-3.5 shrink-0 animate-spin" />
        ) : (
          <Play className="size-3.5 shrink-0 fill-current translate-x-px" />
        )}
        <span className="hidden sm:inline">
          {running ? "Converting…" : "Run"}
        </span>
      </span>
    </Button>
  );

  return (
    <header className="workbench-chrome flex h-[var(--toolbar-height)] shrink-0 items-center gap-3 border-b px-3">
      <h2 className="text-ui-title shrink-0">{viewTitles[view]}</h2>

      {view === "setup" && activeProject && onUpdateProject && (
        <Input
          value={activeProject.name}
          readOnly={inputsLocked}
          onChange={(e) => onUpdateProject({ name: e.target.value })}
          className={cn(
            "surface-inset h-7 max-w-[min(280px,28vw)] min-w-[120px] shrink font-medium",
            inputsLocked && "cursor-default opacity-80",
          )}
          aria-label="Project name"
        />
      )}

      {activeProject && (
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {view === "results" && runNotice && (
            <span
              className={cn(
                "text-ui-caption mr-1 hidden max-w-[min(280px,32vw)] truncate xl:inline",
                runNotice === REPOSITORIES_IN_SYNC
                  ? "text-warning"
                  : "text-destructive",
              )}
              title={runNotice}
            >
              {runNotice}
            </span>
          )}

          {runTooltip ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">{runButton}</span>
              </TooltipTrigger>
              <TooltipContent side="bottom">{runTooltip}</TooltipContent>
            </Tooltip>
          ) : (
            runButton
          )}

          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5"
              disabled={runBusy}
              onClick={onRefresh}
              title={UI_COPY.refresh}
            >
              <RefreshCw
                className={cn("size-3.5", snapshotRefreshing && "animate-spin")}
              />
            </Button>
          )}

        </div>
      )}

      {view === "results" && activeProject?.lastRunAt && (
        <time
          dateTime={activeProject.lastRunAt}
          className="text-ui-mono hidden tabular-nums text-muted-foreground xl:inline"
        >
          Last{" "}
          {new Date(activeProject.lastRunAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      )}
    </header>
  );
}
