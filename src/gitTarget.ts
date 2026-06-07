import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import {
  hasResumableConversion,
  recoverConversionArtifactsFromBackup,
} from "./conversionState.js";
import { getResolvedTools, requireGit } from "./deps/resolveTools.js";
import { branchNameFromGitRef } from "./gitRefs.js";

export interface GitTargetStatus {
  /** True when the repo has no commits yet (ideal for first import). */
  empty: boolean;
  hasConversionState: boolean;
  foreignBranches: string[];
  problematic: boolean;
  message?: string;
}

function initGitRepository(gitRepo: string): void {
  mkdirSync(gitRepo, { recursive: true });
  const git = getResolvedTools().git ?? requireGit();
  const init = spawnSync(git, ["init"], {
    cwd: gitRepo,
    encoding: "utf8",
    windowsHide: true,
    env: process.env,
  });
  if (init.status !== 0) {
    throw new Error(
      `git init failed: ${((init.stderr ?? "") + (init.stdout ?? "")).trim()}`,
    );
  }
  runGit(gitRepo, ["config", "core.ignoreCase", "false"]);
}

/** Create `.git` in the target folder when a path is set but not initialized yet. */
export function ensureGitTargetInitialized(gitRepo: string): boolean {
  const trimmed = gitRepo?.trim();
  if (!trimmed) return false;
  if (existsSync(path.join(trimmed, ".git"))) return false;
  initGitRepository(trimmed);
  return true;
}

function runGit(gitRepo: string, args: string[]): { ok: boolean; out: string } {
  const git = getResolvedTools().git ?? requireGit();
  const r = spawnSync(git, ["-C", gitRepo, ...args], {
    encoding: "utf8",
    windowsHide: true,
    env: process.env,
  });
  const out = ((r.stdout ?? "") + (r.stderr ?? "")).trim();
  return { ok: r.status === 0, out };
}

function gitDir(gitRepo: string): string | null {
  const r = runGit(gitRepo, ["rev-parse", "--git-dir"]);
  if (!r.ok) return null;
  const rel = r.out;
  return path.isAbsolute(rel) ? rel : path.join(gitRepo, rel);
}

function listBranches(gitRepo: string): string[] {
  const r = runGit(gitRepo, [
    "for-each-ref",
    "--format=%(refname)",
    "refs/heads/",
  ]);
  if (!r.ok || !r.out) return [];
  return r.out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((ref) => branchNameFromGitRef(ref));
}

export function gitTargetMessage(
  gitRepo: string,
  branches: string[],
): string {
  const list = branches.length ? branches.join(", ") : "existing commits";
  return (
    `The Git target at ${gitRepo} already has branch(es) [${list}] that were not created by hg-fast-export. ` +
    "Use an empty Git repository (git init only, no commits) for the first import, point at a Git repo that already has `.git/hg2git-*` conversion state for incremental sync, or reset the target."
  );
}

export function getGitTargetStatus(gitRepo: string): GitTargetStatus {
  if (!existsSync(path.join(gitRepo, ".git"))) {
    return {
      empty: false,
      hasConversionState: false,
      foreignBranches: [],
      problematic: false,
    };
  }

  const head = runGit(gitRepo, ["rev-parse", "--verify", "HEAD"]);
  if (!head.ok) {
    return {
      empty: true,
      hasConversionState: false,
      foreignBranches: [],
      problematic: false,
    };
  }

  const gd = gitDir(gitRepo);
  if (gd) recoverConversionArtifactsFromBackup(gd);
  const converted = gd ? hasResumableConversion(gd) : false;
  if (converted) {
    return {
      empty: false,
      hasConversionState: true,
      foreignBranches: [],
      problematic: false,
    };
  }

  const foreignBranches = listBranches(gitRepo);
  const problematic = foreignBranches.length > 0;
  return {
    empty: false,
    hasConversionState: false,
    foreignBranches,
    problematic,
    message: problematic
      ? gitTargetMessage(gitRepo, foreignBranches)
      : undefined,
  };
}

/** Remove .git and re-init an empty repository (for fixtures / botched first runs). */
export function resetGitTargetEmpty(gitRepo: string): GitTargetStatus {
  if (!gitRepo?.trim()) {
    throw new Error("gitRepo is required");
  }
  const gitDir = path.join(gitRepo, ".git");
  if (existsSync(gitDir)) {
    rmSync(gitDir, { recursive: true, force: true });
  }
  initGitRepository(gitRepo);
  return getGitTargetStatus(gitRepo);
}

export function checkGitTarget(gitRepo: string, force?: boolean): void {
  const status = getGitTargetStatus(gitRepo);
  if (status.problematic && !force) {
    throw new Error(status.message ?? gitTargetMessage(gitRepo, status.foreignBranches));
  }
}
