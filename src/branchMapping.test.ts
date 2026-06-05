import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildHgToGitBranchMap,
  gitBranchForHg,
  hgBranchForGit,
  matchedGitBranchNames,
  parseBranchesMapFile,
} from "./branchMapping.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("parseBranchesMapFile", () => {
  it("reads quoted and plain assignments", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hg-to-git-branchmap-"));
    tempDirs.push(dir);
    const file = path.join(dir, "branches.map");
    writeFileSync(
      file,
      ['"default"="main"', "feature=feature-git", "# comment", ""].join("\n"),
    );
    const map = parseBranchesMapFile(file);
    expect(map.get("default")).toBe("main");
    expect(map.get("feature")).toBe("feature-git");
  });
});

describe("buildHgToGitBranchMap", () => {
  it("maps default to configured git default", () => {
    const map = buildHgToGitBranchMap({ defaultBranch: "main" });
    expect(gitBranchForHg("default", map)).toBe("main");
  });

  it("reverse lookup finds hg branch for git name", () => {
    const map = buildHgToGitBranchMap({ defaultBranch: "master" });
    expect(hgBranchForGit("master", map)).toBe("default");
    expect(hgBranchForGit("unknown", map)).toBeUndefined();
  });

  it("matchedGitBranchNames includes mapped git branches", () => {
    const map = buildHgToGitBranchMap({ defaultBranch: "main" });
    const matched = matchedGitBranchNames(
      [{ name: "default" }, { name: "feature-x" }],
      map,
    );
    expect(matched.has("main")).toBe(true);
    expect(matched.has("feature-x")).toBe(true);
  });
});
