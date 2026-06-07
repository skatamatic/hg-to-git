import { describe, expect, it } from "vitest";
import { analyzeRepoSync } from "./repoSync.js";
import {
  buildHgToGitBranchMap,
  mergeBranchesMap,
} from "./branchMapping.js";

describe("analyzeRepoSync", () => {
  const branchMap = buildHgToGitBranchMap({ defaultBranch: "master" });

  it("reports paths_missing when repos unset", () => {
    const info = analyzeRepoSync("", "", {
      hg: { valid: false, branches: [] },
      git: { valid: false, branches: [] },
      conversion: null,
      branchLinks: [],
    });
    expect(info.status).toBe("paths_missing");
    expect(info.branchDeltas).toHaveLength(0);
  });

  it("detects never_imported without conversion state", () => {
    const info = analyzeRepoSync("/hg", "/git", {
      hg: { valid: true, tipRevision: 3, branches: [{ name: "default", revision: 3 }] },
      git: { valid: true, branches: [] },
      conversion: null,
      branchLinks: [],
    }, branchMap);
    expect(info.status).toBe("never_imported");
    expect(info.branchDeltas[0]?.status).toBe("hg_only");
  });

  it("reports in_sync when import watermark covers hg tip", () => {
    const info = analyzeRepoSync("D:/hg", "D:/git", {
      hg: {
        valid: true,
        tipRevision: 5,
        branches: [{ name: "default", revision: 5, tip: "abc" }],
      },
      git: {
        valid: true,
        branches: [{ name: "master", tip: "111" }],
      },
      conversion: { importedTip: 6, hgRepo: "D:/hg", mappingEntries: 6, hasMarks: true },
      branchLinks: [{ hgBranch: "default", gitBranch: "master", gitSha: "111" }],
    }, branchMap);
    expect(info.status).toBe("in_sync");
    expect(info.pendingRevisions).toBe(0);
    expect(info.branchDeltas[0]?.status).toBe("synced");
  });

  it("marks pending hg branches above import watermark", () => {
    const info = analyzeRepoSync("D:/hg", "D:/git", {
      hg: {
        valid: true,
        tipRevision: 7,
        branches: [
          { name: "default", revision: 7 },
          { name: "feature", revision: 7 },
        ],
      },
      git: {
        valid: true,
        branches: [
          { name: "master", tip: "a" },
          { name: "feature", tip: "b" },
        ],
      },
      conversion: { importedTip: 5, hgRepo: "D:/hg", mappingEntries: 5, hasMarks: true },
      branchLinks: [],
    }, branchMap);
    expect(info.status).toBe("behind");
    expect(info.pendingRevisions).toBe(3);
    expect(info.branchDeltas.filter((b) => b.status === "pending")).toHaveLength(2);
  });

  it("flags repo path mismatch from conversion metadata", () => {
    const info = analyzeRepoSync("D:/hg-new", "D:/git", {
      hg: { valid: true, tipRevision: 2, branches: [{ name: "default", revision: 2 }] },
      git: { valid: true, branches: [{ name: "master" }] },
      conversion: { importedTip: 3, hgRepo: "D:/hg-old", mappingEntries: 3, hasMarks: true },
      branchLinks: [],
    }, branchMap);
    expect(info.status).toBe("repo_mismatch");
    expect(info.repoPathMismatch).toBe(true);
  });

  it("syncs hg branches whose git names were sanitized", () => {
    const hgName = "For Sprint 2016 - 5";
    const gitName = "For_Sprint_2016_-_5";
    const branchMap = mergeBranchesMap([hgName, "default"], "master");
    const info = analyzeRepoSync("D:/hg", "D:/git", {
      hg: {
        valid: true,
        tipRevision: 4,
        branches: [
          { name: "default", revision: 4 },
          { name: hgName, revision: 4, tip: "abc" },
        ],
      },
      git: {
        valid: true,
        branches: [
          { name: "master", tip: "111" },
          { name: gitName, tip: "222" },
        ],
      },
      conversion: { importedTip: 5, hgRepo: "D:/hg", mappingEntries: 5, hasMarks: true },
      branchLinks: [{ hgBranch: hgName, gitBranch: gitName, gitSha: "222" }],
    }, branchMap);
    const mapped = info.branchDeltas.find((b) => b.hgBranch === hgName);
    expect(mapped?.status).toBe("synced");
    expect(mapped?.gitBranch).toBe(gitName);
    expect(info.branchDeltas.some((b) => b.status === "git_only" && b.name === gitName)).toBe(
      false,
    );
  });

  it("syncs historical hg branches without active heads via branch map", () => {
    const hgName = "wireline2.1";
    const branchMap = mergeBranchesMap(["default", hgName], "master");
    const info = analyzeRepoSync("D:/hg", "D:/git", {
      hg: {
        valid: true,
        tipRevision: 10,
        branches: [
          { name: "default", revision: 10 },
          { name: hgName, tip: "fromgit" },
        ],
      },
      git: {
        valid: true,
        branches: [
          { name: "master", tip: "111" },
          { name: hgName, tip: "fromgit" },
        ],
      },
      conversion: { importedTip: 11, hgRepo: "D:/hg", mappingEntries: 11, hasMarks: true },
      branchLinks: [],
    }, branchMap);
    const row = info.branchDeltas.find((b) => b.hgBranch === hgName);
    expect(row?.status).toBe("synced");
    expect(info.branchDeltas.some((b) => b.status === "git_only" && b.name === hgName)).toBe(
      false,
    );
  });

  it("syncs hg branches when git ref differs only by case", () => {
    const branchMap = mergeBranchesMap(
      ["default", "core", "Core", "nov-fleet-commands", "NOV-fleet-commands"],
      "master",
    );
    const info = analyzeRepoSync("D:/hg", "D:/git", {
      hg: {
        valid: true,
        tipRevision: 10,
        branches: [
          { name: "default", revision: 10 },
          { name: "Core", tip: "aaa" },
          { name: "NOV-fleet-commands", tip: "bbb" },
        ],
      },
      git: {
        valid: true,
        branches: [
          { name: "master", tip: "111" },
          { name: "Core", tip: "aaa" },
          { name: "NOV-fleet-commands", tip: "bbb" },
        ],
      },
      conversion: { importedTip: 11, hgRepo: "D:/hg", mappingEntries: 11, hasMarks: true },
      branchLinks: [],
    }, branchMap);
    expect(info.branchDeltas.filter((b) => b.status === "hg_only")).toHaveLength(0);
    expect(info.branchDeltas.filter((b) => b.status === "synced")).toHaveLength(3);
  });

  it("lists git_only branches not matched by hg", () => {
    const info = analyzeRepoSync("D:/hg", "D:/git", {
      hg: { valid: true, tipRevision: 1, branches: [{ name: "default", revision: 1 }] },
      git: {
        valid: true,
        branches: [
          { name: "master" },
          { name: "orphan-git", tip: "zzz" },
        ],
      },
      conversion: { importedTip: 2, hgRepo: "D:/hg", mappingEntries: 2, hasMarks: true },
      branchLinks: [{ hgBranch: "default", gitBranch: "master", gitSha: "x" }],
    }, branchMap);
    const gitOnly = info.branchDeltas.find((b) => b.status === "git_only");
    expect(gitOnly?.name).toBe("orphan-git");
  });
});
