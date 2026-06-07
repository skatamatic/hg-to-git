import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig, resolveConfigPath, type HgToGitConfig } from "./config.js";
import { parseProjectFile } from "./projectFile.js";
import { ensureBranchesMapForConvert } from "./branchesMap.js";
import { ensureTagsMapForConvert } from "./tagsMap.js";
import type { SnapshotOptions } from "./snapshotOptions.js";

export interface CliRepoSourceOptions {
  project?: string;
  config?: string;
  hgRepo?: string;
  gitRepo?: string;
}

export interface CliConvertOptions extends CliRepoSourceOptions {
  authorsMap?: string;
  branchesMap?: string;
  tagsMap?: string;
  defaultBranch?: string;
  encoding?: string;
  fileEncoding?: string;
  sanitizeNames?: boolean;
  hgTags?: boolean;
  signedOffBy?: boolean;
  ignoreUnnamedHeads?: boolean;
  force?: boolean;
  maxRevision?: number;
  repackAfterImport?: boolean;
  checkoutWorkingTree?: boolean;
  fastExportPath?: string;
  python?: string;
}

export function cliContextFromProgram(opts: {
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  color?: boolean;
}): {
  json: boolean;
  quiet: boolean;
  verbose: boolean;
  color: boolean;
} {
  return {
    json: Boolean(opts.json),
    quiet: Boolean(opts.quiet),
    verbose: Boolean(opts.verbose),
    color: opts.color !== false,
  };
}

async function loadProjectPartial(projectPath: string): Promise<{
  name: string;
  hgRepo: string;
  gitRepo: string;
  defaultBranch?: string;
  checkoutWorkingTree?: boolean;
}> {
  const raw = await readFile(path.resolve(projectPath), "utf8");
  return parseProjectFile(raw);
}

function convertOverrides(opts: CliConvertOptions): Partial<HgToGitConfig> {
  const merged: Partial<HgToGitConfig> = {};
  if (opts.hgRepo) merged.hgRepo = opts.hgRepo;
  if (opts.gitRepo) merged.gitRepo = opts.gitRepo;
  if (opts.authorsMap) merged.authorsMap = opts.authorsMap;
  if (opts.branchesMap) merged.branchesMap = opts.branchesMap;
  if (opts.tagsMap) merged.tagsMap = opts.tagsMap;
  if (opts.defaultBranch) merged.defaultBranch = opts.defaultBranch;
  if (opts.encoding) merged.encoding = opts.encoding;
  if (opts.fileEncoding) merged.fileEncoding = opts.fileEncoding;
  if (opts.sanitizeNames != null) merged.sanitizeNames = opts.sanitizeNames;
  if (opts.hgTags != null) merged.hgTags = opts.hgTags;
  if (opts.signedOffBy != null) merged.signedOffBy = opts.signedOffBy;
  if (opts.ignoreUnnamedHeads != null) {
    merged.ignoreUnnamedHeads = opts.ignoreUnnamedHeads;
  }
  if (opts.force != null) merged.force = opts.force;
  if (opts.maxRevision != null) merged.maxRevision = opts.maxRevision;
  if (opts.repackAfterImport != null) {
    merged.repackAfterImport = opts.repackAfterImport;
  }
  if (opts.checkoutWorkingTree != null) {
    merged.checkoutWorkingTree = opts.checkoutWorkingTree;
  }
  if (opts.fastExportPath) merged.fastExportPath = opts.fastExportPath;
  if (opts.python) merged.python = opts.python;
  return merged;
}

/** Resolve hg/git paths and config from project file, json config, and CLI flags. */
export async function resolveCliConfig(
  opts: CliConvertOptions,
): Promise<HgToGitConfig> {
  let base: Partial<HgToGitConfig> = {};

  if (opts.project) {
    const project = await loadProjectPartial(opts.project);
    base = {
      ...base,
      hgRepo: project.hgRepo,
      gitRepo: project.gitRepo,
      defaultBranch: project.defaultBranch,
      checkoutWorkingTree: project.checkoutWorkingTree,
    };
  }

  const gitRepo =
    opts.gitRepo?.trim() || base.gitRepo?.trim() || undefined;
  const configPath =
    opts.config?.trim() ||
    (gitRepo ? resolveConfigPath(gitRepo) : undefined);

  return loadConfig(configPath, {
    ...base,
    ...convertOverrides(opts),
  });
}

/** Build the request body used by conversion and validation workers. */
export async function buildConvertRequest(
  opts: CliConvertOptions,
): Promise<Record<string, unknown>> {
  const config = await resolveCliConfig(opts);
  const branchesMap = await ensureBranchesMapForConvert({
    gitRepo: config.gitRepo,
    hgRepo: config.hgRepo,
    defaultBranch: config.defaultBranch,
    branchesMap: config.branchesMap,
  });
  const tagsMap = await ensureTagsMapForConvert({
    gitRepo: config.gitRepo,
    hgRepo: config.hgRepo,
    tagsMap: config.tagsMap,
  });

  return {
    ...config,
    ...(branchesMap ? { branchesMap } : {}),
    ...(tagsMap ? { tagsMap } : {}),
    ...(branchesMap || tagsMap ? { sanitizeNames: false } : {}),
    ignoreUnnamedHeads: config.ignoreUnnamedHeads ?? true,
  };
}

export async function resolveSnapshotOptions(
  opts: CliConvertOptions,
): Promise<{
  hgRepo: string;
  gitRepo: string;
  snapshotOpts: SnapshotOptions;
}> {
  const config = await resolveCliConfig(opts);
  let snapshotOpts: SnapshotOptions = {
    defaultBranch: config.defaultBranch,
    branchesMap: config.branchesMap,
    tagsMap: config.tagsMap,
  };

  try {
    const branchesMap = await ensureBranchesMapForConvert({
      gitRepo: config.gitRepo,
      hgRepo: config.hgRepo,
      defaultBranch: config.defaultBranch,
      branchesMap: config.branchesMap,
      includeHistoricalBranchNames: false,
    });
    const tagsMap = await ensureTagsMapForConvert({
      gitRepo: config.gitRepo,
      hgRepo: config.hgRepo,
      tagsMap: config.tagsMap,
    });
    snapshotOpts = {
      defaultBranch: config.defaultBranch,
      branchesMap: branchesMap ?? config.branchesMap,
      tagsMap: tagsMap ?? config.tagsMap,
    };
  } catch {
    if (!snapshotOpts.defaultBranch) snapshotOpts.defaultBranch = "master";
  }

  return {
    hgRepo: config.hgRepo,
    gitRepo: config.gitRepo,
    snapshotOpts,
  };
}

export function requireRepoSource(opts: CliRepoSourceOptions): void {
  const hasProject = Boolean(opts.project?.trim());
  const hasPair = Boolean(opts.hgRepo?.trim() && opts.gitRepo?.trim());
  const hasGitWithConfig = Boolean(opts.gitRepo?.trim() || opts.config?.trim());
  if (hasProject || hasPair) return;
  if (hasGitWithConfig) return;
  throw new Error(
    "Specify --project <file>, or both --hg-repo and --git-repo, or --git-repo with .hg-to-git.json in that folder.",
  );
}
