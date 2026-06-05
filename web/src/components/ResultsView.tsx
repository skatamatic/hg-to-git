import type { Project, RepoSnapshot } from "../types";
import { BranchMap } from "./BranchMap";
import { StatsRow } from "./StatsRow";
import { StatusPanel } from "./StatusPanel";
interface Props {
  project: Project | null;
  snapshot: RepoSnapshot | null;
  percent: number;
  progressLabel: string;
  running: boolean;
  runStatus: "idle" | "running" | "success" | "error";
  revisionsImported?: number;
  incremental?: boolean;
}

export function ResultsView({
  project,
  snapshot,
  percent,
  progressLabel,
  running,
  runStatus,
  revisionsImported,
  incremental,
}: Props) {
  if (!project?.hgRepo || !project?.gitRepo) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-ui-title">
          Configure repositories in Setup
        </p>
        <p className="max-w-sm text-ui-caption">
          Set Mercurial and Git paths on the Setup tab, then return here to
          run the conversion.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-2 overflow-hidden p-3">
        <StatsRow snapshot={snapshot} dense />
        <StatusPanel
          dense
          percent={percent}
          label={progressLabel}
          running={running}
          status={runStatus}
          revisionsImported={revisionsImported}
          incremental={incremental}
        />
        <BranchMap
          dense
          fill
          expandable
          snapshot={snapshot}
          hgPath={project.hgRepo}
          gitPath={project.gitRepo}
          defaultBranch={project.defaultBranch ?? "master"}
        />
      </div>
    </div>
  );
}
