import { ArrowRightLeft } from "lucide-react";
import type { RepoSnapshot } from "../types";
import type { UiSettings } from "../types";
import { cn } from "../lib/utils";
import { ThemeToggle } from "./ThemeToggle";
import { Badge } from "./ui/badge";

interface Props {
  settings: UiSettings;
  snapshot: RepoSnapshot | null;
}

function RepoPill({
  label,
  path,
  accent,
}: {
  label: string;
  path: string;
  accent: "hg" | "git";
}) {
  const configured = path.trim().length > 0;
  const name = configured ? path.replace(/^.*[/\\]/, "") || path : "Not set";

  return (
    <div
      className={cn(
        "hidden items-center gap-2 rounded-full border px-2.5 py-1 md:flex",
        configured
          ? accent === "hg"
            ? "border-hg/25 bg-hg-muted/30"
            : "border-git/25 bg-git-muted/30"
          : "border-border/60 bg-muted/40",
      )}
      title={path || undefined}
    >
      <span
        className={cn(
          "text-ui-label",
          accent === "hg" ? "text-hg" : "text-git",
        )}
      >
        {label}
      </span>
      <span className="text-ui-mono max-w-[120px] truncate text-foreground/80">
        {name}
      </span>
    </div>
  );
}

export function AppHeader({ settings, snapshot }: Props) {
  const hasData = snapshot?.hg.valid || snapshot?.git.valid;

  return (
    <header className="sticky top-0 z-50 h-[var(--header-height)] shrink-0 border-b border-border/60 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-[1680px] items-center justify-between gap-4 px-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-elevated">
            <ArrowRightLeft className="size-4 text-accent" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h1 className="text-ui-heading truncate">hg-to-git</h1>
            <p className="text-ui-caption truncate">
              Mercurial → Git migration
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <RepoPill label="Hg" path={settings.hgRepo} accent="hg" />
          <RepoPill label="Git" path={settings.gitRepo} accent="git" />

          {hasData && (
            <Badge variant="accent" className="hidden sm:inline-flex">
              Connected
            </Badge>
          )}

          {settings.lastRunAt && (
            <div className="hidden items-center gap-2 border-l border-border/60 pl-3 lg:flex">
              <time
                dateTime={settings.lastRunAt}
                className="text-ui-mono tabular-nums text-muted-foreground"
              >
                {new Date(settings.lastRunAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
          )}

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
