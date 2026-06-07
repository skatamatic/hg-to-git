import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildHgToGitBranchMap,
  expandHgBranchesForSnapshot,
  gitBranchForHg,
  hgBranchForGit,
  matchedGitBranchNames,
  mergeBranchesMap,
  parseBranchesMapFile,
  pickCanonicalHgBranchName,
  resolveGitBranchName,
  sanitizeGitBranchName,
  serializeBranchesMap,
} from "./branchMapping.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("sanitizeGitBranchName", () => {
  it("replaces spaces and invalid ref characters", () => {
    expect(sanitizeGitBranchName("For Sprint 2016 - 5")).toBe(
      "For_Sprint_2016_-_5",
    );
  });

  it("collapses repeated underscores like hg-fast-export", () => {
    expect(sanitizeGitBranchName("Bug_Local_Customization_Integration__tests")).toBe(
      "Bug_Local_Customization_Integration_tests",
    );
  });
});

describe("mergeBranchesMap", () => {
  it("maps hg branches that need sanitization", () => {
    const map = mergeBranchesMap(
      ["default", "For Sprint 2016 - 5", "feature"],
      "master",
    );
    expect(map.get("default")).toBe("master");
    expect(map.get("For Sprint 2016 - 5")).toBe("For_Sprint_2016_-_5");
    expect(map.get("feature")).toBe("feature");
  });

  it("maps legacy branch labels that only appear in history", () => {
    const map = mergeBranchesMap(
      ["default", "45800-nFrac Cloud API", "Alarm Visibility"],
      "master",
    );
    expect(map.get("45800-nFrac Cloud API")).toBe("45800-nFrac_Cloud_API");
    expect(map.get("Alarm Visibility")).toBe("Alarm_Visibility");
  });
});

describe("serializeBranchesMap", () => {
  it("quotes branch names with spaces", () => {
    const text = serializeBranchesMap(
      new Map([["For Sprint 2016 - 5", "For_Sprint_2016_-_5"]]),
    );
    expect(text).toContain(
      '"For Sprint 2016 - 5"="For_Sprint_2016_-_5"',
    );
  });
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

describe("resolveGitBranchName", () => {
  it("matches git branches case-insensitively", () => {
    const git = [{ name: "Core" }, { name: "NOV-fleet-commands" }];
    expect(resolveGitBranchName(git, "core")).toBe("Core");
    expect(resolveGitBranchName(git, "nov-fleet-commands")).toBe(
      "NOV-fleet-commands",
    );
  });
});

describe("pickCanonicalHgBranchName", () => {
  it("prefers casing that matches the git ref", () => {
    const active = new Map<string, { revision?: number }>();
    const git = new Map<string, unknown>([
      ["Core", {}],
      ["NOV-fleet-commands", {}],
    ]);
    const map = mergeBranchesMap(
      ["core", "Core", "nov-fleet-commands", "NOV-fleet-commands"],
      "master",
    );
    expect(
      pickCanonicalHgBranchName("core", "Core", active, git, map),
    ).toBe("Core");
    expect(
      pickCanonicalHgBranchName(
        "nov-fleet-commands",
        "NOV-fleet-commands",
        active,
        git,
        map,
      ),
    ).toBe("NOV-fleet-commands");
  });
});

describe("expandHgBranchesForSnapshot", () => {
  it("includes historical names from the branches map", () => {
    const map = mergeBranchesMap(
      ["default", "For Sprint 2016 - 5"],
      "master",
    );
    const expanded = expandHgBranchesForSnapshot(
      [{ name: "default", revision: 10, tip: "aaa" }],
      map,
      [
        { name: "master", tip: "111" },
        { name: "For_Sprint_2016_-_5", tip: "222" },
      ],
    );
    expect(expanded).toHaveLength(2);
    const historical = expanded.find((b) => b.name === "For Sprint 2016 - 5");
    expect(historical?.revision).toBeUndefined();
    expect(historical?.tip).toBe("222");
  });

  it("dedupes case variants to the git ref casing", () => {
    const map = mergeBranchesMap(
      ["core", "Core", "nov-fleet-commands", "NOV-fleet-commands"],
      "master",
    );
    const expanded = expandHgBranchesForSnapshot([], map, [
      { name: "Core", tip: "aaa" },
      { name: "NOV-fleet-commands", tip: "bbb" },
    ]);
    expect(expanded.map((b) => b.name).sort()).toEqual([
      "Core",
      "NOV-fleet-commands",
      "default",
    ]);
  });
});

describe("matchedGitBranchNames", () => {
  it("includes all mapped git names, not only active hg heads", () => {
    const map = mergeBranchesMap(
      ["default", "For Sprint 2016 - 5", "legacy-closed"],
      "master",
    );
    const matched = matchedGitBranchNames([{ name: "default" }], map);
    expect(matched.has("For_Sprint_2016_-_5")).toBe(true);
    expect(matched.has("legacy-closed")).toBe(true);
  });

  it("includes case-resolved git ref names", () => {
    const map = mergeBranchesMap(["core", "Core"], "master");
    const matched = matchedGitBranchNames(
      [{ name: "core" }],
      map,
      [{ name: "Core" }],
    );
    expect(matched.has("Core")).toBe(true);
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
