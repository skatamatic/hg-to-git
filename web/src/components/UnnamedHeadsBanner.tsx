import { AlertTriangle } from "lucide-react";
import type { RepoSnapshot } from "../types";
import { cn } from "../lib/utils";

interface Props {
  snapshot: RepoSnapshot | null;
}

export function UnnamedHeadsBanner({ snapshot }: Props) {
  const revisions = snapshot?.hg.unnamedHeadRevisions;
  if (!snapshot?.hg.valid || !revisions?.length) return null;

  const list = revisions.map((r) => `r${r}`).join(", ");

  return (
    <div
      className={cn(
        "flex shrink-0 items-start gap-2 border-b px-3 py-2",
        "border-warning/30 bg-warning/10 text-warning-foreground",
      )}
      role="status"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="min-w-0 text-ui-caption">
        <p className="font-medium text-foreground">
          Mercurial has unnamed heads ({list})
        </p>
        <p className="text-muted-foreground">
          hg-fast-export cannot represent multiple tips on one branch. Extra
          heads are skipped during import (--ignore-unnamed-heads). To keep one,
          merge or name it as a branch in Mercurial before syncing.
        </p>
      </div>
    </div>
  );
}
