import type { BranchDeltaStatus, BranchInfo, RepoSnapshot } from "../types";

export interface AlignedBranchRow {
  id: string;
  status: BranchDeltaStatus;
  hg: { name: string; revision?: number; tip?: string } | null;
  git: { name: string; tip?: string } | null;
}

const STATUS_SORT: Record<BranchDeltaStatus, number> = {
  pending: 0,
  hg_only: 1,
  git_only: 2,
  unmapped: 3,
  synced: 4,
};

export function buildAlignedBranchRows(snapshot: RepoSnapshot): AlignedBranchRow[] {
  const hgByName = new Map(snapshot.hg.branches.map((b) => [b.name, b]));
  const gitByName = new Map(snapshot.git.branches.map((b) => [b.name, b]));

  const rows: AlignedBranchRow[] = snapshot.sync.branchDeltas.map((d) => {
    const hgName =
      d.status === "git_only" ? undefined : (d.hgBranch ?? d.name);
    const gitName =
      d.status === "hg_only" ? undefined : (d.gitBranch ?? d.name);

    const hgInfo: BranchInfo | undefined = hgName
      ? hgByName.get(hgName)
      : undefined;
    const gitInfo: BranchInfo | undefined = gitName
      ? gitByName.get(gitName)
      : undefined;

    return {
      id: `${hgName ?? ""}|${gitName ?? ""}|${d.status}`,
      status: d.status,
      hg: hgName
        ? {
            name: hgName,
            revision: hgInfo?.revision ?? d.hgRevision,
            tip: hgInfo?.tip ?? d.hgTip,
          }
        : null,
      git: gitName
        ? {
            name: gitName,
            tip: gitInfo?.tip ?? d.gitTip,
          }
        : null,
    };
  });

  rows.sort((a, b) => {
    const byStatus = STATUS_SORT[a.status] - STATUS_SORT[b.status];
    if (byStatus !== 0) return byStatus;
    const aLabel = a.hg?.name ?? a.git?.name ?? "";
    const bLabel = b.hg?.name ?? b.git?.name ?? "";
    return aLabel.localeCompare(bLabel);
  });

  return rows;
}

export function countBranchIssues(rows: AlignedBranchRow[]): number {
  return rows.filter((r) => r.status !== "synced").length;
}

export function statusLabel(status: BranchDeltaStatus): string {
  switch (status) {
    case "synced":
      return "Synced";
    case "pending":
      return "Pending";
    case "hg_only":
      return "Hg only";
    case "git_only":
      return "Git only";
    case "unmapped":
      return "Unmapped";
  }
}

export function statusBadgeVariant(
  status: BranchDeltaStatus,
): "success" | "warning" | "destructive" | "hg" | "git" | "default" {
  switch (status) {
    case "synced":
      return "success";
    case "pending":
      return "warning";
    case "hg_only":
      return "hg";
    case "git_only":
      return "git";
    case "unmapped":
      return "destructive";
  }
}

export function rowSurfaceClass(status: BranchDeltaStatus): string {
  switch (status) {
    case "synced":
      return "border-border/40 bg-transparent";
    case "pending":
      return "border-warning/35 bg-warning/[0.06]";
    case "hg_only":
      return "border-hg/40 bg-hg-muted/10";
    case "git_only":
      return "border-git/40 bg-git-muted/10";
    case "unmapped":
      return "border-destructive/35 bg-destructive/[0.06]";
  }
}

/** Hover tint that deepens the row status color instead of replacing it with neutral gray. */
export function rowHoverClass(status: BranchDeltaStatus): string | undefined {
  switch (status) {
    case "synced":
      return "hover:bg-muted/25";
    case "pending":
      return "hover:bg-warning/[0.12]";
    case "hg_only":
      return "hover:bg-hg-muted/18";
    case "git_only":
      return "hover:bg-git-muted/18";
    case "unmapped":
      return "hover:bg-destructive/[0.12]";
  }
}

/** Expanded row background — keeps status tint (avoids flat `bg-muted` on mismatches). */
export function rowExpandedClass(status: BranchDeltaStatus): string {
  switch (status) {
    case "synced":
      return "bg-muted/20";
    case "pending":
      return "bg-warning/[0.10]";
    case "hg_only":
      return "bg-hg-muted/15";
    case "git_only":
      return "bg-git-muted/15";
    case "unmapped":
      return "bg-destructive/[0.10]";
  }
}
