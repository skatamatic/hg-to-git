import { FolderGit2, GitBranch } from "lucide-react";
import type { Project, RepoSnapshot } from "../types";
import {
  SetupBranchDeltaAside,
  SetupBranchDeltaAsideMobile,
} from "./SetupBranchDeltaAside";
import { GitTargetBanner } from "./GitTargetBanner";
import { IgnoreCaseBanner } from "./IgnoreCaseBanner";
import { UnnamedHeadsBanner } from "./UnnamedHeadsBanner";
import { useInputsLocked } from "../lib/inputsLocked";
import { cn } from "../lib/utils";
import { PathField } from "./PathField";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";

interface Props {
  project: Project | null;
  snapshot: RepoSnapshot | null;
  onUpdate: (partial: Partial<Project>) => void;
  onRefresh: () => void;
  onNewProject: () => void;
  onForceConvert: () => void;
  running?: boolean;
}

function Panel({
  title,
  children,
  className,
  scroll = true,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  scroll?: boolean;
}) {
  return (
    <section
      className={cn(
        "surface-panel flex min-h-0 flex-col overflow-hidden",
        className,
      )}
    >
      <header className="shrink-0 border-b border-border/50 px-3 py-1.5">
        <h3 className="text-ui-label">{title}</h3>
      </header>
      <div
        className={cn(
          "p-3",
          scroll && "min-h-0 flex-1 overflow-y-auto",
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function SetupView({
  project,
  snapshot,
  onUpdate,
  onRefresh,
  onNewProject,
  onForceConvert,
  running,
}: Props) {
  const inputsLocked = useInputsLocked();

  if (!project) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
        <p className="text-ui-title">No project open</p>
        <p className="max-w-sm text-center text-ui-caption">
          Create a project from File → New Project.
        </p>
        <button
          type="button"
          onClick={onNewProject}
          className="rounded-md bg-accent px-4 py-2 font-medium text-accent-foreground"
        >
          New project
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <IgnoreCaseBanner
        gitRepo={project.gitRepo}
        snapshot={snapshot}
        running={running}
        onFixed={onRefresh}
        onForceRun={onForceConvert}
      />
      <GitTargetBanner
        gitRepo={project.gitRepo}
        snapshot={snapshot}
        running={running}
        onReset={onRefresh}
        onForceRun={onForceConvert}
      />
      <UnnamedHeadsBanner snapshot={snapshot} />
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
          <Panel title="Repositories" className="shrink-0" scroll={false}>
            <div className="space-y-2.5">
              <PathField
                id="hg-repo"
                label="Mercurial"
                value={project.hgRepo}
                placeholder="D:\repos\project-hg"
                icon={GitBranch}
                accent="hg"
                dense
                onChange={(v) => onUpdate({ hgRepo: v })}
                onBlur={onRefresh}
              />
              <PathField
                id="git-repo"
                label="Git"
                value={project.gitRepo}
                placeholder="D:\repos\project-git"
                icon={FolderGit2}
                accent="git"
                dense
                onChange={(v) => onUpdate({ gitRepo: v })}
                onBlur={onRefresh}
              />
            </div>
          </Panel>

          <Panel title="Branches" className="shrink-0" scroll={false}>
            <p className="mb-2.5 text-ui-caption">
              Mercurial&apos;s <span className="text-ui-mono">default</span> branch
              is imported under the Git name below. Optionally check out that
              branch so files appear in the Git folder after Run.
            </p>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="default-branch">
                  Main Git branch (Hg default → Git)
                </Label>
                <Input
                  id="default-branch"
                  value={project.defaultBranch ?? "master"}
                  readOnly={inputsLocked}
                  onChange={(e) => onUpdate({ defaultBranch: e.target.value })}
                  className={cn("h-8", inputsLocked && "cursor-default opacity-80")}
                />
              </div>
              <label
                className={cn(
                  "flex items-center gap-2.5",
                  inputsLocked ? "cursor-default opacity-80" : "cursor-pointer",
                )}
              >
                <Switch
                  id="checkout-working-tree"
                  className="shrink-0"
                  disabled={inputsLocked}
                  checked={project.checkoutWorkingTree !== false}
                  onCheckedChange={(v) =>
                    onUpdate({ checkoutWorkingTree: v })
                  }
                />
                <span className="text-ui-caption">
                  Check out{" "}
                  <span className="text-ui-mono text-foreground/90">
                    {project.defaultBranch?.trim() || "master"}
                  </span>{" "}
                  in the Git folder when conversion finishes (updates the working
                  tree; import alone only changes{" "}
                  <span className="text-ui-mono">.git</span>).
                </span>
              </label>
            </div>
          </Panel>

          <SetupBranchDeltaAsideMobile snapshot={snapshot} />
        </div>

        <SetupBranchDeltaAside snapshot={snapshot} />
      </div>
    </div>
  );
}
