import { describe, expect, it } from "vitest";
import {
  canSyncInSimpleMode,
  getSimpleModeProblems,
  isProjectConfigured,
  simpleSyncDisplay,
  simpleSyncHeadline,
} from "./simpleMode";
import { makeRepoSnapshot } from "../test/snapshotFactory";

describe("isProjectConfigured", () => {
  it("requires both repository paths", () => {
    expect(isProjectConfigured({ hgRepo: "a", gitRepo: "b" } as never)).toBe(true);
    expect(isProjectConfigured({ hgRepo: "", gitRepo: "b" } as never)).toBe(false);
  });
});

describe("getSimpleModeProblems", () => {
  it("collects blocking issues from snapshot", () => {
    const snapshot = makeRepoSnapshot({
      hg: { valid: false, branches: [] },
      git: {
        valid: true,
        branches: [],
        tags: [],
        ignoreCaseProblematic: true,
        targetProblematic: true,
      },
      sync: { status: "ahead", branchDeltas: [] } as never,
    });
    const problems = getSimpleModeProblems(snapshot);
    expect(problems.map((p) => p.id)).toEqual(
      expect.arrayContaining(["hg_missing", "ignore_case", "git_target", "ahead"]),
    );
  });
});

describe("simple sync helpers", () => {
  it("blocks sync when problems exist", () => {
    const snapshot = makeRepoSnapshot({ sync: { status: "behind" } as never });
    const problems = getSimpleModeProblems(
      makeRepoSnapshot({ git: { valid: false, branches: [], tags: [] } }),
    );
    expect(canSyncInSimpleMode(snapshot, problems, false)).toBe(false);
  });

  it("allows sync when behind with no problems", () => {
    const snapshot = makeRepoSnapshot({
      sync: { status: "behind", pendingRevisions: 2 } as never,
    });
    expect(canSyncInSimpleMode(snapshot, [], false)).toBe(true);
    expect(canSyncInSimpleMode(snapshot, [], true)).toBe(false);
  });

  it("derives display state and headlines", () => {
    const inSync = makeRepoSnapshot();
    expect(simpleSyncDisplay(inSync, [])).toBe("in_sync");
    expect(simpleSyncHeadline("in_sync").title).toBe("In sync");

    const problems = [{ id: "x", title: "t", detail: "d" }];
    expect(simpleSyncDisplay(inSync, problems)).toBe("blocked");
    expect(simpleSyncHeadline("blocked").title).toBe("Needs attention");
  });
});
