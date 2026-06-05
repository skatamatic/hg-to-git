import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import type { AppView, Project, ProjectsState } from "../types";
import { InputsLockedProvider } from "../lib/inputsLocked";
import { ActivityBar } from "./ActivityBar";
import { AppMenuBar } from "./AppMenuBar";
import { BrowserModeBanner } from "./BrowserModeBanner";
import { AppToolbar } from "./AppToolbar";
import { OutputPanel } from "./OutputPanel";
import type { LogEntry, RepoSnapshot } from "../types";

interface Props {
  view: AppView;
  projectsState: ProjectsState | null;
  activeProject: Project | null;
  outputOpen: boolean;
  outputHeight: number;
  logs: LogEntry[];
  running: boolean;
  children: ReactNode;
  onViewChange: (view: AppView) => void;
  onMenuCommand: (command: string, payload?: unknown) => void;
  onOutputToggle: () => void;
  onOutputHeightChange: (h: number) => void;
  onClearLogs: () => void;
  projectError?: string | null;
  canRun?: boolean;
  snapshot?: RepoSnapshot | null;
  runNotice?: string | null;
  snapshotRefreshing?: boolean;
  onUpdateProject?: (partial: Partial<Project>) => void;
  onConvert?: () => void;
  onRefreshSnapshot?: () => void;
  simpleMode?: boolean;
  blockingOverlay?: React.ReactNode;
  menuRestricted?: boolean;
  appDialogs?: React.ReactNode;
}

export function AppShell({
  view,
  projectsState,
  activeProject,
  outputOpen,
  outputHeight,
  logs,
  running,
  children,
  onViewChange,
  onMenuCommand,
  onOutputToggle,
  onOutputHeightChange,
  onClearLogs,
  projectError,
  canRun,
  snapshot,
  runNotice,
  snapshotRefreshing,
  onUpdateProject,
  onConvert,
  onRefreshSnapshot,
  simpleMode = false,
  blockingOverlay,
  menuRestricted = false,
  appDialogs,
}: Props) {
  return (
    <div className="relative flex h-screen max-h-screen flex-col overflow-hidden bg-panel">
      {projectError && (
        <div
          className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-destructive"
          role="alert"
        >
          {projectError}
        </div>
      )}
      <AppMenuBar
        projects={projectsState?.projects ?? []}
        activeProjectId={projectsState?.lastProjectId ?? null}
        simpleMode={simpleMode}
        projectConfigured={canRun}
        restricted={menuRestricted}
        syncRunning={running}
        onCommand={onMenuCommand}
      />
      <InputsLockedProvider locked={running}>
        <div
          className={cn(
            "flex min-h-0 flex-1 workbench-main",
            menuRestricted && "pointer-events-none select-none",
          )}
        >
          {!simpleMode && (
            <ActivityBar
              view={view}
              onViewChange={onViewChange}
              navLocked={running}
            />
          )}
        <div className="flex min-w-0 flex-1 flex-col bg-background">
          {!simpleMode && (
            <AppToolbar
              view={view}
              activeProject={activeProject}
              running={running}
              canRun={canRun}
              snapshot={snapshot}
              runNotice={runNotice}
              snapshotRefreshing={snapshotRefreshing}
              onUpdateProject={onUpdateProject}
              onConvert={onConvert}
              onRefresh={onRefreshSnapshot}
            />
          )}
          <main className="flex min-h-0 flex-1 flex-col">{children}</main>
          {!simpleMode && (
            <OutputPanel
              open={outputOpen}
              height={outputHeight}
              logs={logs}
              running={running}
              onToggle={onOutputToggle}
              onHeightChange={onOutputHeightChange}
              onClear={onClearLogs}
            />
          )}
        </div>
        </div>
      </InputsLockedProvider>
      <BrowserModeBanner />
      {blockingOverlay}
      {appDialogs}
    </div>
  );
}
