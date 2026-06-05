import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
} from "lucide-react";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";

interface Props {
  percent: number;
  label: string;
  running: boolean;
  status: "idle" | "running" | "success" | "error";
  revisionsImported?: number;
  incremental?: boolean;
  dense?: boolean;
}

const steps = [
  "Check tools and repository paths",
  "Export Mercurial history",
  "Import into Git via fast-export",
];

export function StatusPanel({
  percent,
  label,
  running,
  status,
  revisionsImported,
  incremental,
  dense,
}: Props) {
  const title = running
    ? "Converting repository"
    : status === "success"
      ? incremental
        ? "Incremental sync finished"
        : "Migration complete"
      : status === "error"
        ? "Something went wrong"
        : "Ready when you are";

  const Icon = running
    ? Loader2
    : status === "success"
      ? CheckCircle2
      : status === "error"
        ? AlertCircle
        : Sparkles;

  const showSteps = status === "idle" && !running && !dense;

  if (dense) {
    return (
      <section
        className={cn(
          "surface-panel flex shrink-0 items-center gap-3 px-3 py-2",
          running && "border-accent/30",
          status === "success" && "border-success/25",
          status === "error" && "border-destructive/25",
        )}
      >
        <Icon
          className={cn(
            "size-4 shrink-0",
            running && "animate-spin text-accent",
            status === "success" && "text-success",
            status === "error" && "text-destructive",
            status === "idle" && "text-muted-foreground",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-ui-title">{title}</p>
          <p className="truncate text-ui-caption">
            {label || (running ? "Export in progress…" : "See Output for logs")}
          </p>
        </div>
        {revisionsImported != null && revisionsImported > 0 && (
          <Badge variant="success" className="shrink-0">
            +{revisionsImported}
          </Badge>
        )}
        <div className="flex w-28 shrink-0 items-center gap-2">
          <Progress
            value={running || status === "success" ? percent : 0}
            className="h-1.5 flex-1"
            indicatorClassName={cn(
              "bg-accent",
              status === "success" && "bg-success",
              status === "error" && "bg-destructive",
            )}
          />
          <span className="text-ui-mono w-8 tabular-nums text-muted-foreground">
            {running || status === "success" ? `${percent}%` : "—"}
          </span>
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card/80 via-card/40 to-transparent p-5 sm:p-6",
        running && "border-accent/30",
        status === "success" && "border-success/25",
        status === "error" && "border-destructive/25",
      )}
    >
      {running && (
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(6,182,212,0.06),transparent)] animate-pulse" />
      )}

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-4">
          <div
            className={cn(
              "flex size-12 shrink-0 items-center justify-center rounded-xl border",
              running && "border-accent/40 bg-accent/10 text-accent",
              status === "success" && "border-success/30 bg-success/10 text-success",
              status === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
              status === "idle" && "border-border/80 bg-elevated text-muted-foreground",
            )}
          >
            <Icon className={cn("size-5", running && "animate-spin")} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-ui-heading">{title}</h2>
              {running && <Badge variant="accent">Live</Badge>}
              {revisionsImported != null && revisionsImported > 0 && (
                <Badge variant="success">
                  +{revisionsImported} revisions
                </Badge>
              )}
            </div>
            <p className="text-ui-caption mt-1 max-w-xl">
              {label ||
                (showSteps
                  ? "Set repository paths, then run."
                  : "Waiting for output…")}
            </p>

            {showSteps && (
              <ol className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
                {steps.map((step, i) => (
                  <li
                    key={step}
                    className="text-ui-caption flex items-center gap-2"
                  >
                    <span className="text-ui-mono flex size-5 items-center justify-center rounded-full bg-muted font-medium text-foreground/70">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <div className="w-full shrink-0 lg:w-72">
          <div className="text-ui-caption mb-2 flex items-center justify-between">
            <span className="font-medium text-muted-foreground">Export progress</span>
            <span className="text-ui-mono tabular-nums text-foreground/80">
              {running || status === "success" ? `${percent}%` : "—"}
            </span>
          </div>
          <Progress
            value={running || status === "success" ? percent : 0}
            className="h-2"
            indicatorClassName={cn(
              "bg-accent",
              status === "success" && "bg-success",
              status === "error" && "bg-destructive",
            )}
          />
        </div>
      </div>
    </section>
  );
}
