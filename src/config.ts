import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export interface HgToGitConfig {
  /** Path to the Mercurial repository (local clone). */
  hgRepo: string;
  /** Path to the Git repository (initialized, may be empty). */
  gitRepo: string;
  /** Override path to fast-export checkout (contains hg-fast-export.py). */
  fastExportPath?: string;
  /** Author mapping file (hg → git identity). */
  authorsMap?: string;
  /** Branch rename mapping file. */
  branchesMap?: string;
  /** Tag rename mapping file. */
  tagsMap?: string;
  /** Name for Mercurial's `default` branch in Git (default: master). */
  defaultBranch?: string;
  /**
   * Disable hg-fast-export's built-in branch/tag name sanitization.
   * Recommended when using branch/tag maps.
   */
  sanitizeNames?: boolean;
  /** Source encoding for commit metadata (passed as -e). */
  encoding?: string;
  /** Source encoding for file names (passed as --fe). */
  fileEncoding?: string;
  /** Export .hgtags files (--hgtags). */
  hgTags?: boolean;
  /** Parse Signed-off-by lines for author (--signed-off-by / -s). */
  signedOffBy?: boolean;
  /** Ignore unnamed heads (--ignore-unnamed-heads). */
  ignoreUnnamedHeads?: boolean;
  /** Force past validation errors (--force). */
  force?: boolean;
  /** Maximum hg revision to import (-m). */
  maxRevision?: number;
  /** Run git gc --aggressive after import. */
  repackAfterImport?: boolean;
  /** Check out defaultBranch after import (updates working tree). */
  checkoutWorkingTree?: boolean;
  /** @deprecated Use checkoutWorkingTree + defaultBranch */
  checkoutBranch?: string;
  /** Python executable (default: python3 or python). */
  python?: string;
}

const CONFIG_FILENAMES = [".hg-to-git.json", "hg-to-git.json"];

export function resolveConfigPath(
  gitRepo: string,
  explicit?: string,
): string | undefined {
  if (explicit) return path.resolve(explicit);
  for (const name of CONFIG_FILENAMES) {
    const p = path.join(gitRepo, name);
    if (existsSync(p)) return p;
  }
  return undefined;
}

export async function loadConfig(
  configPath?: string,
  overrides: Partial<HgToGitConfig> = {},
): Promise<HgToGitConfig> {
  let base: Partial<HgToGitConfig> = {};
  if (configPath && existsSync(configPath)) {
    const raw = await readFile(configPath, "utf8");
    base = JSON.parse(raw) as Partial<HgToGitConfig>;
  }
  const merged = { ...base, ...overrides };
  if (!merged.hgRepo) {
    throw new Error("hgRepo is required (config or --hg-repo)");
  }
  if (!merged.gitRepo) {
    throw new Error("gitRepo is required (config or --git-repo)");
  }
  const checkoutWorkingTree =
    merged.checkoutWorkingTree ??
    (merged.checkoutBranch != null && String(merged.checkoutBranch).trim()
      ? true
      : undefined);

  return {
    defaultBranch: "master",
    hgTags: true,
    sanitizeNames: false,
    repackAfterImport: true,
    ...merged,
    checkoutWorkingTree,
    hgRepo: path.resolve(merged.hgRepo),
    gitRepo: path.resolve(merged.gitRepo),
    authorsMap: merged.authorsMap
      ? path.resolve(merged.authorsMap)
      : undefined,
    branchesMap: merged.branchesMap
      ? path.resolve(merged.branchesMap)
      : undefined,
    tagsMap: merged.tagsMap ? path.resolve(merged.tagsMap) : undefined,
    fastExportPath: merged.fastExportPath
      ? path.resolve(merged.fastExportPath)
      : undefined,
  };
}
