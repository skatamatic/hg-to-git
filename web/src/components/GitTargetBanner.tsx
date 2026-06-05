import { FolderGit2, RotateCcw, Zap } from "lucide-react";
import { useState } from "react";
import { resetGitTarget } from "../api";
import type { RepoSnapshot } from "../types";
import { UI_COPY } from "../lib/uiCopy";
import { Button } from "./ui/button";

interface Props {
  gitRepo: string;
  snapshot: RepoSnapshot | null;
  onReset: () => void;
  onForceRun: () => void;
  running?: boolean;
}

export function GitTargetBanner({
  gitRepo,
  snapshot,
  onReset,
  onForceRun,
  running,
}: Props) {
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const problematic =
    snapshot?.git.valid && snapshot.git.targetProblematic === true;
  const branches = snapshot?.git.foreignBranches ?? [];

  if (!problematic || !gitRepo) return null;

  const handleReset = async () => {
    if (
      !confirm(
        "Reset the Git target? This deletes .git and re-initializes an empty repository. Uncommitted work in that folder will be lost.",
      )
    ) {
      return;
    }
    setResetting(true);
    setResetError(null);
    try {
      const r = await resetGitTarget(gitRepo);
      if (!r.ok) {
        setResetError(r.error ?? "Reset failed");
        return;
      }
      onReset();
    } catch (e) {
      setResetError(String(e));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div
      className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-4 py-2"
      role="alert"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <FolderGit2 className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="font-medium text-foreground">
              Git target is not empty
              {branches.length > 0 && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  — branch{branches.length > 1 ? "es" : ""}: {branches.join(", ")}
                </span>
              )}
            </p>
            <p className="text-ui-caption">
              hg-fast-export needs an empty repo for the first import (git init only, no
              commits). The test fixture used to seed a <code className="text-ui-mono">master</code> commit; reset or use force.
            </p>
            {resetError && <p className="mt-1 text-destructive">{resetError}</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <Button
            size="sm"
            className="h-7 gap-1.5"
            disabled={resetting || running}
            onClick={() => void handleReset()}
          >
            <RotateCcw className="size-3.5" />
            {resetting ? "Resetting…" : "Reset Git target"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5"
            disabled={running}
            onClick={onForceRun}
            title={UI_COPY.forceRun}
          >
            <Zap className="size-3.5" />
            Run with force
          </Button>
        </div>
      </div>
    </div>
  );
}
