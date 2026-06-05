import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getResolvedTools } from "./deps/resolveTools.js";
import { getGitTargetStatus } from "./gitTarget.js";
import { getIgnoreCaseStatus } from "./prerequisites.js";
import {
  buildHgToGitBranchMap,
  gitBranchForHg,
  hgBranchForGit,
  type HgToGitBranchMap,
} from "./branchMapping.js";
import type { SnapshotOptions } from "./snapshotOptions.js";
import { analyzeRepoSync, type RepoSyncInfo } from "./repoSync.js";
import {
  SNAPSHOT_PROGRESS,
  type SnapshotProgressReporter,
} from "./snapshotProgress.js";

export type { RepoSyncInfo, SyncStatusKind, BranchDelta, PendingChangeset } from "./repoSync.js";
export { analyzeRepoSync };

const STATE_PREFIX = "hg2git";

export interface BranchInfo {
  name: string;
  tip?: string;
  revision?: number;
  commitCount?: number;
}

export interface ConversionState {
  importedTip: number;
  hgRepo?: string;
  mappingEntries: number;
  hasMarks: boolean;
}

export interface RepoSnapshot {
  hg: {
    valid: boolean;
    tipRevision?: number;
    tipNode?: string;
    branches: BranchInfo[];
  };
  git: {
    valid: boolean;
    branches: BranchInfo[];
    tags: string[];
    ignoreCase?: boolean;
    ignoreCaseProblematic?: boolean;
    targetEmpty?: boolean;
    targetProblematic?: boolean;
    foreignBranches?: string[];
  };
  conversion: ConversionState | null;
  branchLinks: { hgBranch: string; gitBranch: string; gitSha: string }[];
  sync: RepoSyncInfo;
}

function runExe(exe: string | null, args: string[]): string {
  if (!exe) return "";
  const r = spawnSync(exe, args, {
    encoding: "utf8",
    windowsHide: true,
    env: process.env,
  });
  if (r.status !== 0) return "";
  return (r.stdout ?? "").trim();
}

function gitDir(gitRepo: string): string | null {
  const rel = runExe(getResolvedTools().git, ["-C", gitRepo, "rev-parse", "--git-dir"]);
  if (!rel) return null;
  return path.isAbsolute(rel) ? rel : path.join(gitRepo, rel);
}

function readConversionState(gitRepo: string): ConversionState | null {
  const gd = gitDir(gitRepo);
  if (!gd) return null;
  const statePath = path.join(gd, `${STATE_PREFIX}-state`);
  const mappingPath = path.join(gd, `${STATE_PREFIX}-mapping`);
  if (!existsSync(statePath)) return null;

  let importedTip = 0;
  let hgRepo: string | undefined;
  for (const line of readFileSync(statePath, "utf8").split(/\r?\n/)) {
    const tip = line.match(/^:tip\s+(\d+)/);
    if (tip) importedTip = parseInt(tip[1], 10);
    const repo = line.match(/^:repo\s+(.+)$/);
    if (repo) hgRepo = repo[1].trim();
  }

  let mappingEntries = 0;
  if (existsSync(mappingPath)) {
    mappingEntries = readFileSync(mappingPath, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.startsWith(":")).length;
  }

  const marksPath = path.join(gd, `${STATE_PREFIX}-marks`);
  const hasMarks =
    existsSync(marksPath) && readFileSync(marksPath, "utf8").trim().length > 0;

  return { importedTip, hgRepo, mappingEntries, hasMarks };
}

function readBranchLinks(
  gitRepo: string,
  branchMap: HgToGitBranchMap,
): RepoSnapshot["branchLinks"] {
  const gd = gitDir(gitRepo);
  if (!gd) return [];
  const headsPath = path.join(gd, `${STATE_PREFIX}-heads`);
  if (!existsSync(headsPath)) return [];
  const links: RepoSnapshot["branchLinks"] = [];
  for (const line of readFileSync(headsPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^:([^\s]+)\s+([0-9a-f]+)$/i);
    if (m) {
      const gitBranch = m[1];
      links.push({
        gitBranch,
        gitSha: m[2],
        hgBranch: hgBranchForGit(gitBranch, branchMap) ?? gitBranch,
      });
    }
  }
  return links;
}

function hgBranches(hgRepo: string): BranchInfo[] {
  // `hg branches` does not support `--style`; use default output:
  //   default                        7:624c1c92dee4
  const out = runExe(getResolvedTools().hg, ["-R", hgRepo, "branches"]);
  if (!out) return [];
  const branches: BranchInfo[] = [];
  for (const line of out.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(\S+)\s+(\d+):([0-9a-f]+)/i);
    if (m) {
      const name = m[1];
      branches.push({
        name,
        revision: parseInt(m[2], 10),
        tip: m[3].slice(0, 12),
      });
    }
  }
  return branches.sort((a, b) => a.name.localeCompare(b.name));
}

function gitBranches(gitRepo: string): BranchInfo[] {
  const out = runExe(getResolvedTools().git, [
    "-C",
    gitRepo,
    "for-each-ref",
    "refs/heads/",
    "--format=%(refname:short)\t%(objectname:short)\t%(committerdate:iso)",
  ]);
  if (!out) return [];
  return out.split(/\r?\n/).filter(Boolean).map((line) => {
    const [name, tip] = line.split("\t");
    return { name, tip };
  });
}

function gitTags(gitRepo: string): string[] {
  const out = runExe(getResolvedTools().git, [
    "-C",
    gitRepo,
    "for-each-ref",
    "refs/tags/",
    "--format=%(refname:short)",
  ]);
  return out ? out.split(/\r?\n/).filter(Boolean) : [];
}

export function getRepoSnapshot(
  hgRepo: string,
  gitRepo: string,
  options: SnapshotOptions = {},
  onProgress?: SnapshotProgressReporter,
): RepoSnapshot {
  const report = (detail: string) => {
    onProgress?.(detail);
  };

  report(SNAPSHOT_PROGRESS.verifying);
  const hgValid = existsSync(path.join(hgRepo, ".hg"));
  const gitValid = existsSync(path.join(gitRepo, ".git"));

  let tipRevision: number | undefined;
  let tipNode: string | undefined;
  if (hgValid) {
    report(SNAPSHOT_PROGRESS.hgTip);
    const hg = getResolvedTools().hg;
    const rev = runExe(hg, ["-R", hgRepo, "log", "-r", "tip", "-T", "{rev}"]);
    const node = runExe(hg, [
      "-R",
      hgRepo,
      "log",
      "-r",
      "tip",
      "-T",
      "{node|short}",
    ]);
    if (rev) tipRevision = parseInt(rev, 10);
    if (node) tipNode = node;
  }

  if (hgValid) report(SNAPSHOT_PROGRESS.hgBranches);
  const hgBranchList = hgValid ? hgBranches(hgRepo) : [];
  const branchMap = buildHgToGitBranchMap({
    defaultBranch: options.defaultBranch,
    branchesMapPath: options.branchesMap,
    hgBranchNames: hgBranchList.map((b) => b.name),
  });

  if (gitValid) report(SNAPSHOT_PROGRESS.gitBranches);
  const gitBranchList = gitValid ? gitBranches(gitRepo) : [];
  const gitTagList = gitValid ? gitTags(gitRepo) : [];
  if (gitValid) report(SNAPSHOT_PROGRESS.conversion);
  const conversion = gitValid ? readConversionState(gitRepo) : null;
  const branchLinks = gitValid ? readBranchLinks(gitRepo, branchMap) : [];
  if (gitValid) report(SNAPSHOT_PROGRESS.gitChecks);
  const ignoreCase = gitValid ? getIgnoreCaseStatus(gitRepo) : null;
  const gitTarget = gitValid ? getGitTargetStatus(gitRepo) : null;

  const core = {
    hg: {
      valid: hgValid,
      tipRevision,
      tipNode,
      branches: hgBranchList,
    },
    git: {
      valid: gitValid,
      branches: gitBranchList,
      tags: gitTagList,
      ignoreCase: ignoreCase?.enabled,
      ignoreCaseProblematic: ignoreCase?.problematic,
      targetEmpty: gitTarget?.empty,
      targetProblematic: gitTarget?.problematic,
      foreignBranches: gitTarget?.foreignBranches,
    },
    conversion,
    branchLinks,
  };

  report(SNAPSHOT_PROGRESS.sync);
  const sync = analyzeRepoSync(hgRepo, gitRepo, core, branchMap);
  return {
    ...core,
    sync,
  };
}
