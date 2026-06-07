import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  countMappingEntries,
  ensureConversionStateBootstrap,
  hasResumableConversion,
  hg2gitMappingPath,
  hg2gitStatePath,
  parseImportedTipFromState,
  readImportedTip,
  recoverConversionArtifactsFromBackup,
} from "./conversionState.js";

describe("conversionState", () => {
  const temps: string[] = [];

  afterEach(() => {
    for (const dir of temps) {
      rmSync(dir, { recursive: true, force: true });
    }
    temps.length = 0;
  });

  function tempGitDir(): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), "hg2git-state-"));
    temps.push(dir);
    return dir;
  }

  it("counts mapping entries", () => {
    const content = ":abc 0\n:def 1\n\nignored\n";
    expect(countMappingEntries(content)).toBe(2);
  });

  it("parses state file tip and repo", () => {
    const parsed = parseImportedTipFromState(
      ":tip 42\n:repo D:/Repos/hg\n",
    );
    expect(parsed.tip).toBe(42);
    expect(parsed.hgRepo).toBe("D:/Repos/hg");
  });

  it("infers imported tip from mapping when state is missing", () => {
    const gd = tempGitDir();
    writeFileSync(
      hg2gitMappingPath(gd),
      ":aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 0\n:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 1\n",
      "utf8",
    );
    expect(readImportedTip(gd)).toBe(2);
    expect(hasResumableConversion(gd)).toBe(true);
  });

  it("bootstraps missing state from mapping", () => {
    const gd = tempGitDir();
    writeFileSync(
      hg2gitMappingPath(gd),
      ":aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 0\n",
      "utf8",
    );
    const wrote = ensureConversionStateBootstrap(gd, "D:/Repos/hg");
    expect(wrote).toBe(true);
    expect(readFileSync(hg2gitStatePath(gd), "utf8")).toContain(":tip 1");
    expect(readFileSync(hg2gitStatePath(gd), "utf8")).toContain(
      `:repo ${path.resolve("D:/Repos/hg")}`,
    );
  });

  it("recovers artifacts from ~ backups", () => {
    const gd = tempGitDir();
    const mapping = hg2gitMappingPath(gd);
    writeFileSync(mapping + "~", ":cccccccccccccccccccccccccccccccccccccccc 0\n", "utf8");
    expect(existsSync(mapping)).toBe(false);
    expect(recoverConversionArtifactsFromBackup(gd)).toBe(true);
    expect(readFileSync(mapping, "utf8")).toContain(":cccc");
  });

  it("fixture test-git is resumable", () => {
    const fixtureGit = path.resolve("fixtures/test-git/.git");
    if (!existsSync(fixtureGit)) return;
    expect(hasResumableConversion(fixtureGit)).toBe(true);
    expect(readImportedTip(fixtureGit)).toBeGreaterThan(0);
  });
});
