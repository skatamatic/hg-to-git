import { FileText, FolderGit2, GitBranch, Play, RefreshCw } from "lucide-react";
import type { UiSettings } from "../types";
import { cn } from "../lib/utils";
import { PathField } from "./PathField";
import { Button } from "./ui/button";

interface Props {
  settings: UiSettings;
  running: boolean;
  runNotice?: string | null;
  onUpdate: (partial: Partial<UiSettings>) => void;
  onConvert: () => void;
  onRefresh: () => void;
}

export function RepoSidebar({
  settings,
  running,
  runNotice,
  onUpdate,
  onConvert,
  onRefresh,
}: Props) {
  const canRun = Boolean(settings.hgRepo?.trim() && settings.gitRepo?.trim()) && !running;

  return (
    <aside
      className="surface-panel flex w-full flex-col lg:w-[var(--sidebar-width)] lg:sticky lg:self-start"
      style={{
        top: "var(--sidebar-sticky-top)",
        maxHeight: "calc(100vh - var(--sidebar-sticky-top) - var(--layout-gap))",
      }}
    >
      <div className="scrollbar-themed flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="space-y-4 px-4 py-4">
          <p className="text-ui-label">Configuration</p>

          <PathField
            id="hg-repo"
            label="Mercurial"
            value={settings.hgRepo}
            placeholder="D:\repos\project-hg"
            icon={GitBranch}
            accent="hg"
            onChange={(v) => onUpdate({ hgRepo: v })}
            onBlur={onRefresh}
          />
          <PathField
            id="git-repo"
            label="Git"
            value={settings.gitRepo}
            placeholder="D:\repos\project-git"
            icon={FolderGit2}
            accent="git"
            onChange={(v) => onUpdate({ gitRepo: v })}
            onBlur={onRefresh}
          />
          <PathField
            id="authors"
            label="Authors map"
            value={settings.authorsMap ?? ""}
            placeholder="authors.map"
            icon={FileText}
            accent="neutral"
            pickKind="file"
            pickTitle="Select authors.map file"
            onChange={(v) => onUpdate({ authorsMap: v || undefined })}
          />

          {runNotice && (
            <p
              className={cn(
                "rounded-lg px-3 py-2",
                "bg-destructive/10 text-destructive ring-1 ring-destructive/20",
              )}
            >
              {runNotice}
            </p>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border/60 bg-muted/30 px-4 py-3">
        <div className="flex flex-col gap-2">
          <Button size="lg" className="w-full" disabled={!canRun} onClick={onConvert}>
            {running ? (
              <>
                <RefreshCw className="animate-spin" />
                Converting…
              </>
            ) : (
              <>
                <Play className="fill-current" />
                Run conversion
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" className="w-full" disabled={running} onClick={onRefresh}>
            <RefreshCw />
            Refresh
          </Button>
        </div>
      </div>
    </aside>
  );
}
