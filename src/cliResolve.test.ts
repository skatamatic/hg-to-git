import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PROJECT_FILE_SUFFIX,
  serializeProjectFile,
} from "./projectFile.js";
import type { Project } from "./server/projects.js";
import { requireRepoSource, resolveCliConfig } from "./cliResolve.js";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "hg-to-git-cli-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("requireRepoSource", () => {
  it("accepts project file", () => {
    expect(() =>
      requireRepoSource({ project: "C:/proj" + PROJECT_FILE_SUFFIX }),
    ).not.toThrow();
  });

  it("accepts hg and git pair", () => {
    expect(() =>
      requireRepoSource({ hgRepo: "C:/hg", gitRepo: "C:/git" }),
    ).not.toThrow();
  });

  it("rejects missing source", () => {
    expect(() => requireRepoSource({})).toThrow(/Specify/);
  });
});

describe("resolveCliConfig", () => {
  it("loads project file and CLI overrides", async () => {
    const hg = tempDir();
    const git = tempDir();
    const project: Project = {
      id: "p1",
      name: "Fixture",
      hgRepo: hg,
      gitRepo: git,
      defaultBranch: "main",
      checkoutWorkingTree: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const projectPath = path.join(tempDir(), `Fixture${PROJECT_FILE_SUFFIX}`);
    writeFileSync(projectPath, serializeProjectFile(project));

    const config = await resolveCliConfig({
      project: projectPath,
      checkoutWorkingTree: true,
    });

    expect(config.hgRepo).toBe(path.resolve(hg));
    expect(config.gitRepo).toBe(path.resolve(git));
    expect(config.defaultBranch).toBe("main");
    expect(config.checkoutWorkingTree).toBe(true);
  });

  it("merges .hg-to-git.json in git repo", async () => {
    const hg = tempDir();
    const git = tempDir();
    writeFileSync(
      path.join(git, ".hg-to-git.json"),
      JSON.stringify({
        hgRepo: hg,
        gitRepo: git,
        defaultBranch: "develop",
      }),
    );

    const config = await resolveCliConfig({ gitRepo: git });
    expect(config.defaultBranch).toBe("develop");
    expect(config.hgRepo).toBe(path.resolve(hg));
  });
});
