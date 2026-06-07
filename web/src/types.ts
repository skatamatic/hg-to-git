export type LogLevel = "info" | "progress" | "warn" | "error" | "success";

export type AppView = "setup" | "results";

export type ToolId = "git" | "hg" | "python" | "mercurial";

export interface ToolCheck {
  id: ToolId;
  name: string;
  description: string;
  installed: boolean;
  version?: string;
  detail?: string;
  canAutoInstall: boolean;
}

export interface ToolchainReport {
  ok: boolean;
  platform: string;
  canAutoInstall: boolean;
  installerNote?: string;
  tools: ToolCheck[];
}

export interface Project {
  id: string;
  name: string;
  hgRepo: string;
  gitRepo: string;
  defaultBranch?: string;
  checkoutWorkingTree?: boolean;
  simpleMode?: boolean;
  lastRunAt?: string;
  lastRunStatus?: "success" | "error" | "idle";
  projectFile?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectsState {
  version: 1;
  lastProjectId: string | null;
  projects: Project[];
  recentProjectIds?: string[];
}

export interface UiSettings {
  hgRepo: string;
  gitRepo: string;
  defaultBranch?: string;
  checkoutWorkingTree?: boolean;
  lastRunAt?: string;
  lastRunStatus?: "success" | "error" | "idle";
}

export interface BranchInfo {
  name: string;
  tip?: string;
  revision?: number;
}

export interface BranchCommit {
  revision?: number;
  node?: string;
  sha: string;
  author: string;
  message: string;
  /** ISO-style author/commit date from hg or git. */
  date?: string;
  tags?: string[];
}

export interface AlignedCommitPair {
  hg: BranchCommit | null;
  git: BranchCommit | null;
}

export interface BranchHistoryResult {
  hgBranch?: string;
  gitBranch?: string;
  pairs: AlignedCommitPair[];
  limit: number;
  offset: number;
  hasMoreHg: boolean;
  hasMoreGit: boolean;
}

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
  importedTip: number;
  hgTip: number;
  hgChangesetCount: number;
  syncPercent: number;
  repoPathMismatch: boolean;
  recordedHgRepo?: string;
  pendingChangesets: PendingChangeset[];
  branchDeltas: BranchDelta[];
}

export interface RepoSnapshot {
  hg: {
    valid: boolean;
    tipRevision?: number;
    tipNode?: string;
    branches: BranchInfo[];
    unnamedHeadRevisions?: number[];
  };
  git: {
    valid: boolean;
    branches: BranchInfo[];
    tags: string[];
    ignoreCase?: boolean;
    ignoreCaseProblematic?: boolean;
    targetEmpty?: boolean;
    targetProblematic?: boolean;
    foreignBranches?: string[];
  };
  conversion: {
    importedTip: number;
    hgRepo?: string;
    mappingEntries: number;
    hasMarks: boolean;
  } | null;
  branchLinks: { hgBranch: string; gitBranch: string; gitSha: string }[];
  sync: RepoSyncInfo;
}

export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  stream?: string;
  revisionCurrent?: number;
  revisionMax?: number;
  branch?: string;
  at: number;
}

export interface ConvertResult {
  incremental: boolean;
  revisionsImported: number;
}
