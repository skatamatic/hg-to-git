import {
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useCallback, useState } from "react";
import { fetchToolchain, installToolchain } from "../api";
import type { ToolCheck, ToolchainReport, ToolId } from "../types";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

const MANUAL_URLS: Record<ToolId, string> = {
  git: "https://git-scm.com/download/win",
  python: "https://www.python.org/downloads/",
  mercurial: "https://www.mercurial-scm.org/wiki/PythonImplementation",
  hg: "https://www.mercurial-scm.org/wiki/downloads",
};

interface Props {
  initial: ToolchainReport;
  onReady: (report: ToolchainReport) => void;
  /** Embedded in startup overlay (not full-screen page). */
  variant?: "page" | "overlay";
}

export function DependenciesSetup({
  initial,
  onReady,
  variant = "page",
}: Props) {
  const [report, setReport] = useState(initial);
  const [installing, setInstalling] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);

  const missing = report.tools.filter((t) => !t.installed);

  const recheck = useCallback(async () => {
    setChecking(true);
    try {
      const next = await fetchToolchain();
      setReport(next);
      if (next.ok) onReady(next);
    } finally {
      setChecking(false);
    }
  }, [onReady]);

  const handleReady = useCallback(
    (report: ToolchainReport) => {
      if (report.ok) onReady(report);
    },
    [onReady],
  );

  const runInstall = () => {
    if (installing || missing.length === 0) return;
    setInstalling(true);
    setLogs([]);
    const ids = missing.map((t) => t.id);
    installToolchain(ids, {
      onLog: (msg) => setLogs((prev) => [...prev, msg]),
      onDone: (data) => {
        setInstalling(false);
        setReport(data.report);
        if (data.ok) handleReady(data.report);
      },
      onError: (msg) => {
        setInstalling(false);
        setLogs((prev) => [...prev, msg]);
      },
    });
  };

  const panel = (
      <div
        className={cn(
          "surface-panel w-full space-y-6",
          variant === "overlay"
            ? "max-h-[min(70vh,calc(100vh-var(--menubar-height)-4rem))] overflow-y-auto rounded-lg p-6 text-left"
            : "max-w-lg rounded-2xl p-8",
        )}
      >
        <div className="space-y-2 text-center">
          <h1 className="text-ui-heading">Set up conversion tools</h1>
          <p className="text-ui-caption">
            {report.installerNote}
          </p>
        </div>

        <ul className="space-y-3">
          {report.tools.map((tool) => (
            <ToolRow key={tool.id} tool={tool} />
          ))}
        </ul>

        {logs.length > 0 && (
          <div className="text-ui-mono text-ui-caption scrollbar-themed max-h-36 overflow-y-auto rounded-lg border border-border/60 bg-muted/30 p-3">
            {logs.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          {report.canAutoInstall && missing.length > 0 && (
            <Button
              className="flex-1"
              size="lg"
              disabled={installing}
              onClick={runInstall}
            >
              {installing ? (
                <>
                  <Loader2 className="animate-spin" />
                  Installing…
                </>
              ) : (
                <>
                  <Download />
                  Install missing ({missing.length})
                </>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            className="flex-1"
            size="lg"
            disabled={installing || checking}
            onClick={() => void recheck()}
          >
            {checking ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            Check again
          </Button>
        </div>

        {!report.canAutoInstall && missing.length > 0 && (
          <p className="text-ui-caption text-center">
            Install the tools above manually, then click Check again. You may need
            to restart the app so PATH updates.
          </p>
        )}
      </div>
  );

  if (variant === "overlay") {
    return panel;
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background p-6">
      {panel}
    </div>
  );
}

function ToolRow({ tool }: { tool: ToolCheck }) {
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2.5",
        tool.installed
          ? "border-success/25 bg-success/5"
          : "border-border/60 bg-muted/20",
      )}
    >
      {tool.installed ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium">{tool.name}</span>
          {tool.version && (
            <span className="text-ui-mono truncate text-muted-foreground">
              {tool.version}
            </span>
          )}
        </div>
        <p className="text-ui-caption">{tool.description}</p>
        {tool.detail && !tool.installed && (
          <p className="text-ui-caption mt-0.5 text-destructive/90">{tool.detail}</p>
        )}
      </div>
      {!tool.installed && (
        <a
          href={MANUAL_URLS[tool.id]}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title="Download manually"
        >
          <ExternalLink className="size-3.5" />
        </a>
      )}
    </li>
  );
}
