import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  mergeBranchesMap,
  parseBranchesMapFile,
  serializeBranchesMap,
} from "./branchMapping.js";
import { listHgBranchNamesForMapping } from "./repoInfo.js";

export function defaultBranchesMapPath(gitRepo: string): string {
  return path.join(gitRepo, ".hg-to-git", "branches.map");
}

/** Write/update `.hg-to-git/branches.map` from hg branches and any existing entries. */
export async function ensureBranchesMapForConvert(opts: {
  gitRepo: string;
  hgRepo: string;
  defaultBranch?: string;
  /** Optional user-provided map path (merged into generated file). */
  branchesMap?: string;
  /**
   * When true (default), scan all changesets for branch labels.
   * Required for names like `For Sprint 2016 - 5` that no longer appear in `hg branches`.
   */
  includeHistoricalBranchNames?: boolean;
}): Promise<string | undefined> {
  const gitRepo = opts.gitRepo?.trim();
  const hgRepo = opts.hgRepo?.trim();
  if (!gitRepo || !hgRepo) return undefined;

  const hgNames = listHgBranchNamesForMapping(hgRepo, {
    includeHistorical: opts.includeHistoricalBranchNames !== false,
  });
  if (hgNames.length === 0) return undefined;

  const outPath = opts.branchesMap?.trim()
    ? path.resolve(opts.branchesMap)
    : defaultBranchesMapPath(gitRepo);

  const existing = parseBranchesMapFile(outPath);
  if (opts.branchesMap?.trim() && opts.branchesMap !== outPath) {
    for (const [hg, git] of parseBranchesMapFile(path.resolve(opts.branchesMap))) {
      existing.set(hg, git);
    }
  }

  const merged = mergeBranchesMap(
    hgNames,
    opts.defaultBranch ?? "master",
    existing,
  );

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, serializeBranchesMap(merged), "utf8");
  return outPath;
}
