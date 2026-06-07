import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { ensureGitTargetInitialized } from "./gitTarget.js";
import {
  refreshResolvedTools,
  requireGit,
  requireHg,
  requirePython,
} from "./deps/resolveTools.js";

export interface ToolVersions {
  git: string;
  hg: string;
  python: string;
  mercurial: string;
}

function run(exe: string, args: string[]): { ok: boolean; out: string } {
  const r = spawnSync(exe, args, {
    encoding: "utf8",
    windowsHide: true,
    env: process.env,
  });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  return { ok: r.status === 0, out: out.trim() };
}

export function findPython(preferred?: string): string {
  return requirePython(preferred);
}

export function assertHgRepo(hgRepo: string): void {
  if (!existsSync(path.join(hgRepo, ".hg"))) {
    throw new Error(`Not a Mercurial repository: ${hgRepo}`);
  }
}

export function assertGitRepo(gitRepo: string): void {
  ensureGitTargetInitialized(gitRepo);
  if (!existsSync(path.join(gitRepo, ".git"))) {
    throw new Error(`Not a Git repository: ${gitRepo}`);
  }
}

export interface IgnoreCaseStatus {
  /** Whether `core.ignoreCase` is explicitly true. */
  enabled: boolean;
  /** Raw config value, if set. */
  raw?: string;
  /** True when conversion should warn or block without --force. */
  problematic: boolean;
  message?: string;
}

export function ignoreCaseMessage(gitRepo: string): string {
  return (
    "git config core.ignoreCase is true in the target repo. This breaks rename fidelity on Windows/macOS. " +
    `Run: git -C "${gitRepo}" config core.ignoreCase false — or pass --force.`
  );
}

export function getIgnoreCaseStatus(gitRepo: string): IgnoreCaseStatus {
  if (!existsSync(path.join(gitRepo, ".git"))) {
    return { enabled: false, problematic: false };
  }
  const git = requireGit();
  const r = run(git, ["-C", gitRepo, "config", "--get", "core.ignoreCase"]);
  if (!r.ok || !r.out) {
    return { enabled: false, problematic: false };
  }
  const enabled = r.out.toLowerCase() === "true";
  return {
    enabled,
    raw: r.out,
    problematic: enabled,
    message: enabled ? ignoreCaseMessage(gitRepo) : undefined,
  };
}

/** Set `core.ignoreCase` to false in the target Git repository. */
export function fixIgnoreCase(gitRepo: string): IgnoreCaseStatus {
  refreshResolvedTools();
  const git = requireGit();
  const set = run(git, ["-C", gitRepo, "config", "core.ignoreCase", "false"]);
  if (!set.ok) {
    throw new Error(
      `Failed to set core.ignoreCase false: ${set.out || "git config failed"}`,
    );
  }
  return getIgnoreCaseStatus(gitRepo);
}

export function checkIgnoreCase(gitRepo: string, force?: boolean): void {
  const status = getIgnoreCaseStatus(gitRepo);
  if (status.problematic && !force) {
    throw new Error(status.message ?? ignoreCaseMessage(gitRepo));
  }
}

export function detectVersions(
  gitRepo: string,
  hgRepo: string,
  python?: string,
): ToolVersions {
  refreshResolvedTools();
  const git = requireGit();
  const hg = requireHg();
  const py = findPython(python);
  const gitV = run(git, ["--version"]);
  const hgV = run(hg, ["--version"]);
  const pyV = run(py, ["--version"]);
  const hgMod = run(py, ["-c", "import mercurial; print(mercurial.__version__)"]);
  if (!gitV.ok) throw new Error("git is not installed or not on PATH");
  if (!hgV.ok) throw new Error("hg (Mercurial) is not installed or not on PATH");
  assertHgRepo(hgRepo);
  assertGitRepo(gitRepo);
  return {
    git: gitV.out.split("\n")[0] ?? gitV.out,
    hg: hgV.out.split("\n")[0] ?? hgV.out,
    python: pyV.out.split("\n")[0] ?? pyV.out,
    mercurial: hgMod.out.split("\n")[0] ?? hgMod.out,
  };
}
