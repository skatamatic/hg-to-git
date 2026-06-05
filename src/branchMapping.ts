import { existsSync, readFileSync } from "node:fs";

/** Mercurial branch name → Git branch name (hg-fast-export -M / -B). */
export type HgToGitBranchMap = Map<string, string>;

const HG_DEFAULT_BRANCH = "default";

/** Parse fast-export style branch map: `"hg"="git"` or `hg=git`. */
export function parseBranchesMapFile(filePath: string): HgToGitBranchMap {
  const map = new Map<string, string>();
  if (!existsSync(filePath)) return map;

  for (const raw of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("--")) continue;

    const quoted = line.match(/^"([^"]+)"\s*=\s*"([^"]+)"\s*$/);
    if (quoted) {
      map.set(quoted[1], quoted[2]);
      continue;
    }

    const plain = line.match(/^([^=\s]+)\s*=\s*(\S+)\s*$/);
    if (plain) {
      map.set(plain[1], plain[2]);
    }
  }

  return map;
}

export function buildHgToGitBranchMap(options: {
  defaultBranch?: string;
  branchesMapPath?: string;
  hgBranchNames?: string[];
}): HgToGitBranchMap {
  const map = new Map<string, string>();

  if (options.branchesMapPath) {
    for (const [hg, git] of parseBranchesMapFile(options.branchesMapPath)) {
      map.set(hg, git);
    }
  }

  const gitDefault = (options.defaultBranch ?? "master").trim() || "master";
  if (!map.has(HG_DEFAULT_BRANCH)) {
    map.set(HG_DEFAULT_BRANCH, gitDefault);
  }

  return map;
}

export function gitBranchForHg(
  hgBranch: string,
  map: HgToGitBranchMap,
): string {
  return map.get(hgBranch) ?? hgBranch;
}

export function hgBranchForGit(
  gitBranch: string,
  map: HgToGitBranchMap,
): string | undefined {
  for (const [hg, git] of map) {
    if (git === gitBranch) return hg;
  }
  return undefined;
}

/** Git branch names that are accounted for by an hg branch (name or mapped). */
export function matchedGitBranchNames(
  hgBranches: { name: string }[],
  map: HgToGitBranchMap,
): Set<string> {
  const names = new Set<string>();
  for (const b of hgBranches) {
    names.add(gitBranchForHg(b.name, map));
  }
  return names;
}
