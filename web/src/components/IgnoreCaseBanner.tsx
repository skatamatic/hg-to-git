import { AlertTriangle, Wrench, Zap } from "lucide-react";
import { useState } from "react";
import { fixGitIgnoreCase } from "../api";
import type { RepoSnapshot } from "../types";
import { UI_COPY } from "../lib/uiCopy";
import { Button } from "./ui/button";

interface Props {
  gitRepo: string;
  snapshot: RepoSnapshot | null;
  onFixed: () => void;
  onForceRun: () => void;
  running?: boolean;
}

export function IgnoreCaseBanner({
  gitRepo,
  snapshot,
  onFixed,
  onForceRun,
  running,
}: Props) {
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);

  const problematic =
    snapshot?.git.valid && snapshot.git.ignoreCaseProblematic === true;

  if (!problematic || !gitRepo) return null;

  const handleFix = async () => {
    setFixing(true);
    setFixError(null);
    try {
      const r = await fixGitIgnoreCase(gitRepo);
      if (!r.ok) {
        setFixError(r.error ?? "Could not update git config");
        return;
      }
      onFixed();
    } catch (e) {
      setFixError(String(e));
    } finally {
      setFixing(false);
    }
  };

  return (
    <div
      className="shrink-0 border-b border-warning/40 bg-warning/15 px-4 py-2"
      role="alert"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="font-medium text-foreground">
              Git <code className="text-ui-mono">core.ignoreCase</code> is true
            </p>
            <p className="text-ui-caption">
              Rename fidelity on Windows/macOS requires setting it to false before the first
              import.
            </p>
            {fixError && (
              <p className="mt-1 text-destructive">{fixError}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <Button
            size="sm"
            className="h-7 gap-1.5"
            disabled={fixing || running}
            onClick={() => void handleFix()}
          >
            <Wrench className="size-3.5" />
            {fixing ? "Fixing…" : "Fix automatically"}
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
