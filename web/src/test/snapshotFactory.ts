import type { BranchDelta, RepoSnapshot } from "../types";

export function makeRepoSnapshot(
  overrides: Partial<RepoSnapshot> & {
    branchDeltas?: BranchDelta[];
  } = {},
): RepoSnapshot {
  const branchDeltas = overrides.branchDeltas ?? overrides.sync?.branchDeltas ?? [];
  return {
    hg: {
      valid: true,
      tipRevision: 5,
      tipNode: "abc123",
      branches: [
        { name: "default", revision: 5, tip: "abc123" },
        { name: "feature-alpha", revision: 3, tip: "def456" },
      ],
      ...overrides.hg,
    },
    git: {
      valid: true,
      branches: [{ name: "master", tip: "111aaa" }],
      tags: ["v1.0"],
      targetEmpty: false,
      targetProblematic: false,
      ...overrides.git,
    },
    conversion: {
      importedTip: 6,
      hgRepo: "D:/hg",
      mappingEntries: 6,
      hasMarks: true,
      ...overrides.conversion,
    },
    branchLinks: overrides.branchLinks ?? [
      { hgBranch: "default", gitBranch: "master", gitSha: "111aaa" },
    ],
    sync: {
      status: "in_sync",
      title: "In sync",
      summary: "",
      pendingRevisions: 0,
      importedTip: 6,
      hgTip: 5,
      hgChangesetCount: 6,
      syncPercent: 100,
      repoPathMismatch: false,
      pendingChangesets: [],
      branchDeltas,
      ...overrides.sync,
    },
  };
}
