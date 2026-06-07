export type SnapshotProgressReporter = (detail: string) => void;

export const SNAPSHOT_PROGRESS = {
  verifying: "Verifying repository paths…",
  hgTip: "Reading Mercurial tip revision…",
  hgBranches: "Reading Mercurial branches…",
  gitInit: "Initializing Git target repository…",
  gitBranches: "Reading Git branches and tags…",
  conversion: "Reading conversion state (hg2git)…",
  gitChecks: "Checking Git target and settings…",
  sync: "Comparing branches and sync status…",
} as const;
