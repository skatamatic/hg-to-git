import path from "node:path";
import type { BranchInfo, ConversionState } from "./repoInfo.js";
import {
  gitBranchForHg,
  matchedGitBranchNames,
  type HgToGitBranchMap,
} from "./branchMapping.js";

interface SyncSnapshotInput {
  hg: {
    valid: boolean;
    tipRevision?: number;
    branches: BranchInfo[];
  };
  git: {
    valid: boolean;
    branches: BranchInfo[];
  };
  conversion: ConversionState | null;
  branchLinks: { hgBranch: string; gitBranch: string; gitSha: string }[];
}
import { getResolvedTools } from "./deps/resolveTools.js";
import { spawnSync } from "node:child_process";

export type SyncStatusKind =
  | "paths_missing"
  | "hg_missing"
  | "git_missing"
  | "never_imported"
  | "repo_mismatch"
  | "in_sync"
  | "behind"
  | "ahead";

export interface PendingChangeset {
  rev: number;
  node: string;
  branch: string;
  summary: string;
}

export type BranchDeltaStatus =
  | "synced"
  | "pending"
  | "hg_only"
  | "git_only"
  | "unmapped";

export interface BranchDelta {
  /** Primary label (Hg branch name when present). */
  name: string;
  status: BranchDeltaStatus;
  hgBranch?: string;
  gitBranch?: string;
  hgRevision?: number;
  hgTip?: string;
  gitTip?: string;
}

export interface RepoSyncInfo {
  status: SyncStatusKind;
  title: string;
  summary: string;
  pendingRevisions: number;
  /**
   * hg-fast-export `:tip` in git state — exclusive upper bound on hg rev indices
   * (equals total changeset count when fully imported, not the tip rev number).
   */
  importedTip: number;
  /** Mercurial tip revision number (0-based). */
  hgTip: number;
  /** Total changesets in Hg (tip rev + 1). Compare to importedTip for sync. */
  hgChangesetCount: number;
  syncPercent: number;
  repoPathMismatch: boolean;
  recordedHgRepo?: string;
  pendingChangesets: PendingChangeset[];
  branchDeltas: BranchDelta[];
}

function normPath(p: string): string {
  return path.resolve(p).replace(/\\/g, "/").toLowerCase();
}

function runHg(hgRepo: string, args: string[]): string {
  const hg = getResolvedTools().hg;
  if (!hg) return "";
  const r = spawnSync(hg, ["-R", hgRepo, ...args], {
    encoding: "utf8",
    windowsHide: true,
    env: process.env,
  });
  if (r.status !== 0) return "";
  return (r.stdout ?? "").trim();
}

function pendingChangesets(
  hgRepo: string,
  fromRevInclusive: number,
  toRevInclusive: number,
  limit = 24,
): PendingChangeset[] {
  if (toRevInclusive < fromRevInclusive) return [];
  const out = runHg(hgRepo, [
    "log",
    "-r",
    `${fromRevInclusive}:${toRevInclusive}`,
    "--template",
    "{rev}|{node|short}|{branch|branch}|{desc|firstline}\n",
  ]);
  if (!out) return [];
  const items: PendingChangeset[] = [];
  for (const line of out.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [rev, node, branch, summary] = line.split("|");
    const n = parseInt(rev ?? "", 10);
    if (Number.isNaN(n)) continue;
    items.push({
      rev: n,
      node: node ?? "",
      branch: branch || "default",
      summary: summary ?? "",
    });
    if (items.length >= limit) break;
  }
  return items.reverse();
}

function statusCopy(
  kind: SyncStatusKind,
  pending: number,
  repoMismatch: boolean,
): { title: string; summary: string } {
  switch (kind) {
    case "paths_missing":
      return {
        title: "Repositories not configured",
        summary: "Set Mercurial and Git paths to analyze sync state.",
      };
    case "hg_missing":
      return {
        title: "Mercurial repo not found",
        summary: "The Hg path is missing or has no .hg directory.",
      };
    case "git_missing":
      return {
        title: "Git repo not found",
        summary: "The Git path is missing or has no .git directory.",
      };
    case "never_imported":
      return {
        title: "Not imported yet",
        summary: "Git repo exists but no hg-fast-export state was found. Run conversion for a full migration.",
      };
    case "repo_mismatch":
      return {
        title: "Recorded source repo differs",
        summary: repoMismatch
          ? "Conversion state points at a different Mercurial path than this project. Re-run conversion against the current Hg repo."
          : "Conversion metadata does not match the current project.",
      };
    case "in_sync":
      return {
        title: "In sync",
        summary: "Git import includes all Mercurial revisions at tip.",
      };
    case "behind":
      return {
        title: "Mercurial is ahead",
        summary:
          pending === 1
            ? "1 new revision in Hg is not in Git yet. Run conversion to import it."
            : `${pending} new revisions in Hg are not in Git yet. Run conversion to catch up.`,
      };
    case "ahead":
      return {
        title: "Import ahead of Hg tip",
        summary:
          "Imported revision is higher than the current Hg tip (history may have been stripped or the repo replaced).",
      };
  }
}

export function analyzeRepoSync(
  hgRepo: string,
  gitRepo: string,
  snapshot: SyncSnapshotInput,
  branchMap: HgToGitBranchMap = new Map(),
): RepoSyncInfo {
  const hgPath = hgRepo?.trim() ?? "";
  const gitPath = gitRepo?.trim() ?? "";
  if (!hgPath || !gitPath) {
    const copy = statusCopy("paths_missing", 0, false);
    return {
      status: "paths_missing",
      title: copy.title,
      summary: copy.summary,
      pendingRevisions: 0,
      importedTip: 0,
      hgTip: 0,
      hgChangesetCount: 0,
      syncPercent: 0,
      repoPathMismatch: false,
      pendingChangesets: [],
      branchDeltas: [],
    };
  }

  const hgTip = snapshot.hg.tipRevision ?? 0;
  const hgChangesetCount =
    snapshot.hg.valid && hgTip >= 0 ? hgTip + 1 : 0;
  /** hg-fast-export state `:tip` — next rev index / exclusive export bound. */
  const importWatermark = snapshot.conversion?.importedTip ?? 0;
  const pending = Math.max(0, hgChangesetCount - importWatermark);
  const syncPercent =
    hgChangesetCount > 0
      ? Math.min(100, Math.round((importWatermark / hgChangesetCount) * 100))
      : 0;

  const linkedHg = new Set(snapshot.branchLinks.map((l) => l.hgBranch));
  const gitNames = new Set(snapshot.git.branches.map((b) => b.name));
  const hgNames = new Set(snapshot.hg.branches.map((b) => b.name));
  const gitMatchedByHg = matchedGitBranchNames(snapshot.hg.branches, branchMap);

  const branchDeltas: BranchDelta[] = [];

  for (const b of snapshot.hg.branches) {
    const rev = b.revision ?? 0;
    const gitBranch = gitBranchForHg(b.name, branchMap);
    const gitBranchInfo = snapshot.git.branches.find((g) => g.name === gitBranch);
    let status: BranchDeltaStatus;
    if (!snapshot.conversion) {
      status = "hg_only";
    } else if (rev >= importWatermark) {
      status = "pending";
    } else if (gitNames.has(gitBranch)) {
      status =
        linkedHg.has(b.name) || linkedHg.has(gitBranch) || gitBranch !== b.name
          ? "synced"
          : "unmapped";
    } else {
      status = "hg_only";
    }
    branchDeltas.push({
      name: b.name,
      hgBranch: b.name,
      gitBranch: gitBranch !== b.name ? gitBranch : undefined,
      status,
      hgRevision: b.revision,
      hgTip: b.tip,
      gitTip: gitBranchInfo?.tip,
    });
  }

  for (const g of snapshot.git.branches) {
    if (gitMatchedByHg.has(g.name)) continue;
    if (hgNames.has(g.name)) continue;
    branchDeltas.push({
      name: g.name,
      gitBranch: g.name,
      status: "git_only",
      gitTip: g.tip,
    });
  }

  branchDeltas.sort((a, b) => a.name.localeCompare(b.name));

  let kind: SyncStatusKind;
  const recorded = snapshot.conversion?.hgRepo;
  const repoPathMismatch =
    recorded != null &&
    hgPath !== "" &&
    normPath(recorded) !== normPath(hgPath);

  if (!snapshot.hg.valid && !snapshot.git.valid) {
    kind = "paths_missing";
  } else if (!snapshot.hg.valid) {
    kind = "hg_missing";
  } else if (!snapshot.git.valid) {
    kind = "git_missing";
  } else if (!snapshot.conversion) {
    kind = "never_imported";
  } else if (repoPathMismatch) {
    kind = "repo_mismatch";
  } else if (importWatermark > hgChangesetCount) {
    kind = "ahead";
  } else if (pending > 0) {
    kind = "behind";
  } else {
    kind = "in_sync";
  }

  const pendingChangesetList =
    kind === "behind" && snapshot.hg.valid
      ? pendingChangesets(hgPath, importWatermark, hgTip)
      : [];

  const copy = statusCopy(kind, pending, repoPathMismatch);

  return {
    status: kind,
    title: copy.title,
    summary: copy.summary,
    pendingRevisions: pending,
    importedTip: importWatermark,
    hgTip,
    hgChangesetCount,
    syncPercent,
    repoPathMismatch,
    recordedHgRepo: recorded,
    pendingChangesets: pendingChangesetList,
    branchDeltas,
  };
}
