import { copyFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  alignCommitsChronological,
  clearHgNodeToGitCache,
  gitLogExcludeRefsFromHeads,
  hgBranchRevSpec,
  loadHgNodeToGitSha,
  parseCommitTagList,
  parseGitTagShowRef,
  parseHgLogOutput,
} from "./branchHistory.js";

const fixtureRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "test",
  "fixtures",
);

const tempDirs: string[] = [];

function makeGitRepoWithHg2git(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "hg-to-git-bh-"));
  tempDirs.push(dir);
  const gitDir = path.join(dir, ".git");
  mkdirSync(gitDir, { recursive: true });
  copyFileSync(path.join(fixtureRoot, "hg2git-marks"), path.join(gitDir, "hg2git-marks"));
  copyFileSync(
    path.join(fixtureRoot, "hg2git-mapping"),
    path.join(gitDir, "hg2git-mapping"),
  );
  return dir;
}

beforeEach(() => {
  clearHgNodeToGitCache();
});

afterEach(() => {
  clearHgNodeToGitCache();
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("parseHgLogOutput", () => {
  it("parses rev, node, tags, and skips invalid lines", () => {
    const out = [
      "0|aaa|aaa|alice|init|",
      "1|BBB|bbb|bob|second|v1.0, beta",
      "not-valid",
      "",
    ].join("\n");
    const commits = parseHgLogOutput(out);
    expect(commits).toHaveLength(2);
    expect(commits[1].revision).toBe(1);
    expect(commits[1].node).toBe("bbb");
    expect(commits[1].tags).toEqual(["v1.0", "beta"]);
  });
});

describe("parseCommitTagList", () => {
  it("dedupes and trims tag names", () => {
    expect(parseCommitTagList(" a, b , a, ")).toEqual(["a", "b"]);
    expect(parseCommitTagList("")).toEqual([]);
  });
});

describe("parseGitTagShowRef", () => {
  it("maps dereferenced tag refs to commit shas", () => {
    const map = parseGitTagShowRef(
      [
        "85346aef85cf0269d10a3eb2b49a0a51b58f856d refs/tags/fixture-v0.1",
        "164083516c4cfe598737435214b26e1375751dc4 refs/tags/fixture-v0.2",
        "d3380233c3bebb3fea4c7dfb5b7e9c9cedee075c refs/tags/release/v1",
      ].join("\n"),
    );
    expect(map.get("85346aef85cf0269d10a3eb2b49a0a51b58f856d")).toEqual([
      "fixture-v0.1",
    ]);
    expect(map.get("d3380233c3bebb3fea4c7dfb5b7e9c9cedee075c")).toEqual([
      "release/v1",
    ]);
  });
});

describe("hgBranchRevSpec", () => {
  it("escapes single quotes in branch names", () => {
    expect(hgBranchRevSpec("foo'bar")).toBe("reverse(branch('foo\\'bar'))");
  });
});

describe("gitLogExcludeRefsFromHeads", () => {
  const heads = ["master", "feature", "release"];

  it("excludes other heads for hg default branch", () => {
    expect(
      gitLogExcludeRefsFromHeads(heads, "master", "default", "master"),
    ).toEqual(["feature", "release"]);
  });

  it("excludes main when hg feature maps to non-main git branch", () => {
    expect(
      gitLogExcludeRefsFromHeads(heads, "feature", "feature-x", "master"),
    ).toEqual(["master"]);
  });

  it("excludes all but target for git-only branch history", () => {
    expect(
      gitLogExcludeRefsFromHeads(heads, "orphan", undefined, "master"),
    ).toEqual(["master", "feature", "release"]);
  });
});

describe("loadHgNodeToGitSha", () => {
  it("maps hg nodes using 1-based mark ids", () => {
    const gitRepo = makeGitRepoWithHg2git();
    const map = loadHgNodeToGitSha(gitRepo);
    expect(map.get("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(map.get("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")).toBe(
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
    expect(map.size).toBe(3);
  });

  it("returns empty map when hg2git files missing", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hg-to-git-empty-"));
    tempDirs.push(dir);
    mkdirSync(path.join(dir, ".git"), { recursive: true });
    expect(loadHgNodeToGitSha(dir).size).toBe(0);
  });
});

describe("alignCommitsChronological", () => {
  const nodeToGit = new Map([
    ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
  ]);

  it("pairs mapped commits and inserts git-only gaps", () => {
    const hg = [
      {
        revision: 0,
        node: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        sha: "aaaa",
        author: "a",
        message: "one",
      },
      {
        revision: 1,
        node: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        sha: "bbbb",
        author: "b",
        message: "two",
      },
    ];
    const git = [
      { sha: "aaaa", author: "a", message: "one" },
      { sha: "extra", author: "x", message: "git only" },
      { sha: "bbbb", author: "b", message: "two" },
    ];

    const pairs = alignCommitsChronological(hg, git, nodeToGit);
    expect(pairs).toHaveLength(3);
    expect(pairs[0].hg?.sha).toBe("aaaa");
    expect(pairs[0].git?.sha).toBe("aaaa");
    expect(pairs[1].hg).toBeNull();
    expect(pairs[1].git?.sha).toBe("extra");
    expect(pairs[2].hg?.sha).toBe("bbbb");
    expect(pairs[2].git?.sha).toBe("bbbb");
  });

  it("leaves hg commits unpaired when unmapped", () => {
    const hg = [
      {
        revision: 2,
        node: "cccccccccccccccccccccccccccccccccccccccc",
        sha: "cccc",
        author: "c",
        message: "three",
      },
    ];
    const pairs = alignCommitsChronological(hg, [], nodeToGit);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].hg?.sha).toBe("cccc");
    expect(pairs[0].git).toBeNull();
  });
});
