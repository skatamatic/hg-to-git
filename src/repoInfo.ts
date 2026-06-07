import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getResolvedTools } from "./deps/resolveTools.js";
import { ensureGitTargetInitialized, getGitTargetStatus } from "./gitTarget.js";
import { getIgnoreCaseStatus } from "./prerequisites.js";
import {
  buildHgToGitBranchMap,
  expandHgBranchesForSnapshot,
  gitBranchForHg,
  hgBranchForGit,
  type HgToGitBranchMap,
} from "./branchMapping.js";
import type { SnapshotOptions } from "./snapshotOptions.js";
import { analyzeRepoSync, type RepoSyncInfo } from "./repoSync.js";
import { branchNameFromGitRef, tagNameFromGitRef } from "./gitRefs.js";
import { listUnnamedHgHeadRevisions } from "./hgHeads.js";
import {
  SNAPSHOT_PROGRESS,
  type SnapshotProgressReporter,
} from "./snapshotProgress.js";

export type { RepoSyncInfo, SyncStatusKind, BranchDelta, PendingChangeset } from "./repoSync.js";
export { analyzeRepoSync };

import {
  countMappingEntries,
  HG2GIT_STATE_PREFIX,
  parseImportedTipFromState,
} from "./conversionState.js";

const STATE_PREFIX = HG2GIT_STATE_PREFIX;

export interface BranchInfo {
  name: string;
  tip?: string;
  revision?: number;
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
    /** Extra branch tips that hg-fast-export flags as unnamed heads. */
    unnamedHeadRevisions?: number[];
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

  let importedTip = 0;
  let hgRepo: string | undefined;

  if (existsSync(statePath)) {
    const parsed = parseImportedTipFromState(readFileSync(statePath, "utf8"));
    importedTip = parsed.tip;
    hgRepo = parsed.hgRepo;
  }

  let mappingEntries = 0;
  if (existsSync(mappingPath)) {
    mappingEntries = countMappingEntries(readFileSync(mappingPath, "utf8"));
    if (importedTip <= 0 && mappingEntries > 0) {
      importedTip = mappingEntries;
    }
  }

  if (importedTip <= 0) return null;

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

export function listHgBranchNames(hgRepo: string): string[] {
  return hgBranches(hgRepo).map((b) => b.name);
}

/** Every distinct `branch` field in changelog (includes closed / legacy names). */
export function listHgBranchNamesFromHistory(hgRepo: string): string[] {
  const out = runExe(getResolvedTools().hg, [
    "-R",
    hgRepo,
    "log",
    "-r",
    "all()",
    "-T",
    "{branch}\n",
    "-q",
  ]);
  if (!out) return [];
  const names = new Set<string>();
  for (const line of out.split(/\r?\n/)) {
    const name = line.trim();
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Names needed for hg-fast-export `-B` (active heads + any branch label in history). */
export function listHgBranchNamesForMapping(
  hgRepo: string,
  options: { includeHistorical?: boolean } = {},
): string[] {
  const names = new Set<string>(listHgBranchNames(hgRepo));
  if (options.includeHistorical !== false) {
    for (const name of listHgBranchNamesFromHistory(hgRepo)) {
      names.add(name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function hgBranches(hgRepo: string): BranchInfo[] {
  const out = runExe(getResolvedTools().hg, [
    "-R",
    hgRepo,
    "branches",
    "-a",
    "-T",
    "{branch}\t{rev}\t{node|short}\n",
  ]);
  if (!out) return [];
  const branches: BranchInfo[] = [];
  for (const line of out.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split("\t");
    if (parts.length < 3) continue;
    const name = parts[0];
    const rev = parseInt(parts[1], 10);
    const node = parts[2];
    if (!name || !Number.isFinite(rev)) continue;
    branches.push({
      name,
      revision: rev,
      tip: node.slice(0, 12),
    });
  }
  return branches.sort((a, b) => a.name.localeCompare(b.name));
}

function gitBranches(gitRepo: string): BranchInfo[] {
  const out = runExe(getResolvedTools().git, [
    "-C",
    gitRepo,
    "for-each-ref",
    "refs/heads/",
    "--format=%(refname)\t%(objectname:short)\t%(committerdate:iso)",
  ]);
  if (!out) return [];
  return out.split(/\r?\n/).filter(Boolean).map((line) => {
    const [ref, tip] = line.split("\t");
    return { name: branchNameFromGitRef(ref ?? ""), tip };
  });
}

function gitTags(gitRepo: string): string[] {
  const out = runExe(getResolvedTools().git, [
    "-C",
    gitRepo,
    "for-each-ref",
    "refs/tags/",
    "--format=%(refname)",
  ]);
  return out
    ? out.split(/\r?\n/).filter(Boolean).map((ref) => tagNameFromGitRef(ref))
    : [];
}

export function listHgTagNames(hgRepo: string): string[] {
  const out = runExe(getResolvedTools().hg, [
    "-R",
    hgRepo,
    "tags",
    "-T",
    "{tag}\n",
  ]);
  if (!out) return [];
  const names = new Set<string>();
  for (const line of out.split(/\r?\n/)) {
    const tag = line.trim();
    if (!tag || tag === "tip") continue;
    names.add(tag);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
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
  if (gitRepo.trim()) {
    report(SNAPSHOT_PROGRESS.gitInit);
    ensureGitTargetInitialized(gitRepo);
  }
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
  const activeHgBranches = hgValid ? hgBranches(hgRepo) : [];
  const unnamedHeadRevisions = hgValid
    ? listUnnamedHgHeadRevisions(hgRepo)
    : undefined;
  const branchMap = buildHgToGitBranchMap({
    defaultBranch: options.defaultBranch,
    branchesMapPath: options.branchesMap,
    hgBranchNames: activeHgBranches.map((b) => b.name),
  });

  if (gitValid) report(SNAPSHOT_PROGRESS.gitBranches);
  let gitBranchList = gitValid ? gitBranches(gitRepo) : [];
  let hgBranchList = hgValid
    ? expandHgBranchesForSnapshot(activeHgBranches, branchMap, gitBranchList)
    : [];

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
      unnamedHeadRevisions:
        unnamedHeadRevisions && unnamedHeadRevisions.length > 0
          ? unnamedHeadRevisions
          : undefined,
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
