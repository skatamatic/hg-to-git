import type { LucideIcon } from "lucide-react";
import { GitBranch, GitCommit, GitMerge, Layers } from "lucide-react";
import type { RepoSnapshot } from "../types";
import { cn } from "../lib/utils";

interface Props {
  snapshot: RepoSnapshot | null;
  dense?: boolean;
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  tint,
  empty,
  dense,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  tint?: "hg" | "git" | "accent";
  empty?: boolean;
  dense?: boolean;
}) {
  if (dense) {
    return (
      <div
        className={cn(
          "surface-panel flex min-w-0 flex-1 gap-2 px-3 py-2",
          !empty && tint === "hg" && "border-hg/15 bg-hg-muted/10",
          !empty && tint === "git" && "border-git/15 bg-git-muted/10",
          !empty && tint === "accent" && "border-accent/15 bg-accent/5",
        )}
      >
        <Icon
          className={cn(
            "mt-0.5 size-3.5 shrink-0 opacity-70",
            tint === "hg" && "text-hg",
            tint === "git" && "text-git",
            tint === "accent" && "text-accent",
            !tint && "text-muted-foreground",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="text-ui-label">{label}</p>
          <p
            className={cn(
              "text-ui-mono text-[length:var(--text-ui-lg)] font-semibold tabular-nums",
              empty ? "text-muted-foreground/40" : "text-foreground",
            )}
          >
            {value}
          </p>
          {detail && (
            <p className="text-ui-caption mt-0.5 text-muted-foreground">{detail}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-3 rounded-xl border border-border/50 bg-card/40 px-4 py-3.5 transition-colors",
        !empty && tint === "hg" && "border-hg/15 bg-hg-muted/10",
        !empty && tint === "git" && "border-git/15 bg-git-muted/10",
        !empty && tint === "accent" && "border-accent/15 bg-accent/5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-ui-label">{label}</span>
        <Icon
          className={cn(
            "size-3.5 shrink-0 opacity-60",
            tint === "hg" && "text-hg",
            tint === "git" && "text-git",
            tint === "accent" && "text-accent",
            !tint && "text-muted-foreground",
          )}
        />
      </div>
      <div>
        <p
          className={cn(
            "text-ui-mono text-[length:var(--text-ui-lg)] font-semibold tabular-nums",
            empty ? "text-muted-foreground/40" : "text-foreground",
          )}
        >
          {value}
        </p>
        {detail && (
          <p className="text-ui-caption mt-1 truncate">{detail}</p>
        )}
      </div>
    </div>
  );
}

export function StatsRow({ snapshot, dense }: Props) {
  const sync = snapshot?.sync;
  const imported = sync?.importedTip ?? snapshot?.conversion?.importedTip ?? 0;
  const hgTip = sync?.hgTip ?? snapshot?.hg.tipRevision ?? 0;
  const hgCount =
    sync?.hgChangesetCount ?? (hgTip >= 0 ? hgTip + 1 : 0);
  const pending =
    sync?.pendingRevisions ?? Math.max(0, hgCount - imported);
  const pct =
    sync?.syncPercent ??
    (hgCount ? Math.round((imported / hgCount) * 100) : 0);
  const empty = !snapshot?.hg.valid && !snapshot?.git.valid;
  const pendingDetail =
    pending > 0
      ? sync?.status === "behind"
        ? "Hg ahead of Git"
        : "Needs sync"
      : sync?.status === "never_imported"
        ? "Not imported"
        : "Fully synced";

  return (
    <div
      className={cn(
        "grid gap-2",
        dense ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 gap-3 xl:grid-cols-4",
      )}
    >
      <Metric
        dense={dense}
        label="Hg tip"
        value={empty ? "—" : hgTip > 0 ? `r${hgTip}` : "—"}
        detail={empty ? "Awaiting paths" : snapshot?.hg.tipNode}
        icon={GitCommit}
        tint="hg"
        empty={empty}
      />
      <Metric
        dense={dense}
        label="Imported"
        value={empty ? "—" : String(imported)}
        detail={
          empty || !hgCount
            ? undefined
            : `${pct}% · ${imported}/${hgCount} changesets`
        }
        icon={Layers}
        tint="accent"
        empty={empty}
      />
      <Metric
        dense={dense}
        label="Pending"
        value={empty ? "—" : String(pending)}
        detail={empty ? undefined : pendingDetail}
        icon={GitMerge}
        tint={pending > 0 ? "git" : undefined}
        empty={empty}
      />
      <Metric
        dense={dense}
        label="Branches"
        value={
          empty
            ? "—"
            : `${snapshot!.hg.branches.length} → ${snapshot!.git.branches.length}`
        }
        detail={
          empty
            ? undefined
            : snapshot!.git.tags.length
              ? `${snapshot!.git.tags.length} tags`
              : undefined
        }
        icon={GitBranch}
        tint="git"
        empty={empty}
      />
    </div>
  );
}
