import type { Project, RepoSnapshot, SyncStatusKind } from "../types";

export function isProjectConfigured(project: Project | null | undefined): boolean {
  return Boolean(project?.hgRepo?.trim() && project?.gitRepo?.trim());
}

export interface SimpleModeProblem {
  id: string;
  title: string;
  detail: string;
}

export function getSimpleModeProblems(
  snapshot: RepoSnapshot | null | undefined,
): SimpleModeProblem[] {
  if (!snapshot) return [];

  const problems: SimpleModeProblem[] = [];

  if (!snapshot.hg.valid) {
    problems.push({
      id: "hg_missing",
      title: "Mercurial repository not found",
      detail: "Check the Hg path in full setup.",
    });
  }
  if (!snapshot.git.valid) {
    problems.push({
      id: "git_missing",
      title: "Git repository not found",
      detail: "Check the Git path in full setup.",
    });
  }
  if (snapshot.git.ignoreCaseProblematic) {
    problems.push({
      id: "ignore_case",
      title: "Git ignore-case is enabled",
      detail: "Fix this in full setup before syncing.",
    });
  }
  if (snapshot.git.targetProblematic) {
    problems.push({
      id: "git_target",
      title: "Git target is not empty",
      detail: "Reset the Git target in full setup.",
    });
  }
  if (snapshot.sync.repoPathMismatch) {
    problems.push({
      id: "repo_mismatch",
      title: "Conversion state does not match this project",
      detail: "Fix repository paths or reset the Git target in full setup.",
    });
  }
  if (snapshot.sync.status === "ahead") {
    problems.push({
      id: "ahead",
      title: "Git import is ahead of Mercurial",
      detail: "Review conversion state in full setup.",
    });
  }

  return problems;
}

export type SimpleSyncDisplay = "in_sync" | "not_in_sync" | "blocked" | "unknown";

export function simpleSyncDisplay(
  snapshot: RepoSnapshot | null | undefined,
  problems: SimpleModeProblem[],
): SimpleSyncDisplay {
  if (problems.length > 0) return "blocked";
  if (!snapshot?.hg.valid || !snapshot?.git.valid) return "unknown";

  const status = snapshot.sync.status;
  if (status === "in_sync") return "in_sync";
  if (status === "behind" || status === "never_imported") return "not_in_sync";
  return "blocked";
}

export function canSyncInSimpleMode(
  snapshot: RepoSnapshot | null | undefined,
  problems: SimpleModeProblem[],
  running: boolean,
): boolean {
  if (running || problems.length > 0) return false;
  if (!snapshot?.hg.valid || !snapshot?.git.valid) return false;
  const status: SyncStatusKind = snapshot.sync.status;
  return status === "behind" || status === "never_imported";
}

export function simpleSyncHeadline(display: SimpleSyncDisplay): {
  title: string;
  subtitle: string;
} {
  switch (display) {
    case "in_sync":
      return {
        title: "In sync",
        subtitle: "Repositories are already in sync.",
      };
    case "not_in_sync":
      return {
        title: "Not in sync",
        subtitle: "New changes can be imported.",
      };
    case "blocked":
      return {
        title: "Needs attention",
        subtitle: "Fix the issues below in full setup.",
      };
    default:
      return {
        title: "Checking…",
        subtitle: "Set repository paths in full setup.",
      };
  }
}
