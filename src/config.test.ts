import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, resolveConfigPath } from "./config.js";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "hg-to-git-config-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("resolveConfigPath", () => {
  it("prefers explicit path", () => {
    const p = resolveConfigPath("/git", "/custom.json");
    expect(p).toBe(path.resolve("/custom.json"));
  });

  it("finds .hg-to-git.json in git repo", () => {
    const git = tempDir();
    const cfg = path.join(git, ".hg-to-git.json");
    writeFileSync(cfg, "{}");
    expect(resolveConfigPath(git)).toBe(cfg);
  });
});

describe("loadConfig", () => {
  it("merges file config with overrides and resolves paths", async () => {
    const hg = tempDir();
    const git = tempDir();
    const cfgPath = path.join(git, "hg-to-git.json");
    writeFileSync(
      cfgPath,
      JSON.stringify({
        hgRepo: hg,
        gitRepo: git,
        defaultBranch: "main",
        checkoutBranch: "main",
      }),
    );

    const loaded = await loadConfig(cfgPath, { hgTags: false });
    expect(loaded.hgRepo).toBe(path.resolve(hg));
    expect(loaded.gitRepo).toBe(path.resolve(git));
    expect(loaded.defaultBranch).toBe("main");
    expect(loaded.checkoutWorkingTree).toBe(true);
    expect(loaded.hgTags).toBe(false);
    expect(loaded.sanitizeNames).toBe(true);
    expect(loaded.repackAfterImport).toBe(true);
  });

  it("throws when hgRepo missing", async () => {
    const git = tempDir();
    await expect(loadConfig(undefined, { gitRepo: git })).rejects.toThrow(
      /hgRepo is required/,
    );
  });
});
