import type { RepoSnapshot } from "../types";
import { buildAlignedBranchRows, countBranchIssues } from "../lib/branchAlign";
import { BranchAlignedRow } from "./BranchAlignedRow";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";

interface Props {
  snapshot: RepoSnapshot | null;
  className?: string;
  /** Wider stacked layout for Setup branch delta sidebar. */
  sidebar?: boolean;
}

export function BranchDeltaList({ snapshot, className, sidebar }: Props) {
  if (!snapshot?.sync.branchDeltas.length) {
    return (
      <p className={cn("text-ui-caption px-3 py-6 text-center", className)}>
        {snapshot?.hg.valid
          ? "No branch differences to show."
          : "Set valid repository paths."}
      </p>
    );
  }

  const rows = buildAlignedBranchRows(snapshot);
  const issues = countBranchIssues(rows);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {issues > 0 && (
        <p className="text-ui-caption shrink-0 border-b border-warning/20 bg-warning/[0.06] px-3 py-1.5 text-warning">
          {issues} branch {issues === 1 ? "mismatch" : "mismatches"} — see status
        </p>
      )}
      <div className="min-h-0 flex-1">
        {rows.map((row) => (
          <BranchAlignedRow key={row.id} row={row} compact sidebar={sidebar} />
        ))}
      </div>
      {issues === 0 && rows.length > 0 && (
        <p className="shrink-0 border-t border-border/40 px-3 py-2 text-center">
          <Badge variant="success">
            All branches synced
          </Badge>
        </p>
      )}
    </div>
  );
}
