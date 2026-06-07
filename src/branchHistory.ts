import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getResolvedTools } from "./deps/resolveTools.js";
import { branchNameFromGitRef } from "./gitRefs.js";

export interface BranchCommit {
  revision?: number;
  /** Full hg node id (40-char hex) when available */
  node?: string;
  sha: string;
  author: string;
  message: string;
  /** Author/commit date (ISO-style string from hg or git). */
  date?: string;
  /** Tag names pointing at this commit (Hg and/or Git). */
  tags?: string[];
}

export interface AlignedCommitPair {
  hg: BranchCommit | null;
  git: BranchCommit | null;
}

export interface BranchHistoryResult {
  hgBranch?: string;
  gitBranch?: string;
  pairs: AlignedCommitPair[];
  limit: number;
  offset: number;
  hasMoreHg: boolean;
  hasMoreGit: boolean;
}

const nodeToGitCache = new Map<string, Map<string, string>>();
const gitTagsByRepoCache = new Map<string, Map<string, string[]>>();

/** Parse comma-separated tag names from hg log template field. */
export function parseCommitTagList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return [...new Set(raw.split(",").map((t) => t.trim()).filter(Boolean))];
}

/** Parse `git show-ref --tags --dereference` (portable; handles annotated tags). */
export function parseGitTagShowRef(output: string): Map<string, string[]> {
  const bySha = new Map<string, string[]>();
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = line.match(/^([0-9a-f]{4,40})\s+refs\/tags\/(.+)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const name = m[2];
    const list = bySha.get(key) ?? [];
    list.push(name);
    bySha.set(key, list);
  }
  return bySha;
}

function loadGitTagsBySha(gitRepo: string): Map<string, string[]> {
  const out = runGit(gitRepo, ["show-ref", "--tags", "--dereference"]);
  return parseGitTagShowRef(out);
}

function getGitTagsBySha(gitRepo: string): Map<string, string[]> {
  const key = path.resolve(gitRepo);
  let cached = gitTagsByRepoCache.get(key);
  if (!cached) {
    cached = loadGitTagsBySha(gitRepo);
    gitTagsByRepoCache.set(key, cached);
  }
  return cached;
}

function gitTagsForSha(tagMap: Map<string, string[]>, sha: string): string[] {
  const want = sha.toLowerCase();
  const exact = tagMap.get(want);
  if (exact?.length) return exact;
  for (const [full, names] of tagMap) {
    if (full.startsWith(want) || want.startsWith(full.slice(0, want.length))) {
      return names;
    }
  }
  return [];
}

function runHg(hgRepo: string, args: string[]): string {
  const hg = getResolvedTools().hg;
  if (!hg) return "";
  const r = spawnSync(hg, ["-R", hgRepo, ...args], {
    encoding: "utf8",
    windowsHide: true,
    env: process.env,
  });
  if (r.status !== 0) return "";
  return (r.stdout ?? "").trim();
}

function runGit(gitRepo: string, args: string[]): string {
  const git = getResolvedTools().git;
  if (!git) return "";
  const r = spawnSync(git, ["-C", gitRepo, ...args], {
    encoding: "utf8",
    windowsHide: true,
    env: process.env,
  });
  if (r.status !== 0) return "";
  return (r.stdout ?? "").trim();
}

/** Mercurial revset for branch history (oldest first). */
export function hgBranchRevSpec(branch: string): string {
  const safe = branch.replace(/'/g, "\\'");
  return `reverse(branch('${safe}'))`;
}

/** Parse `hg log --template` lines: rev|node|short|author|date|message|tags */
export function parseHgLogOutput(out: string): BranchCommit[] {
  const items: BranchCommit[] = [];
  for (const line of out.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [rev, node, sha, author, date, message, tagField] = line.split("|");
    const n = parseInt(rev ?? "", 10);
    if (Number.isNaN(n) || !sha) continue;
    const tags = parseCommitTagList(tagField);
    const when = date?.trim();
    items.push({
      revision: n,
      node: node?.toLowerCase(),
      sha,
      author: author ?? "",
      message: message ?? "",
      ...(when ? { date: when } : {}),
      ...(tags.length ? { tags } : {}),
    });
  }
  return items;
}

function parseGitCommits(out: string): BranchCommit[] {
  const items: BranchCommit[] = [];
  for (const line of out.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split("\x1f");
    const full = parts[0];
    const short = parts[1] ?? full?.slice(0, 12);
    const author = parts[2];
    const date = parts[3]?.trim();
    const message = parts[4];
    if (!short) continue;
    items.push({
      sha: short,
      author: author ?? "",
      message: message ?? "",
      ...(date ? { date } : {}),
    });
  }
  return items;
}

function enrichGitCommitsWithTags(
  gitRepo: string,
  commits: BranchCommit[],
  fullShas: string[],
): void {
  const tagMap = getGitTagsBySha(gitRepo);
  commits.forEach((c, i) => {
    const tags = gitTagsForSha(tagMap, fullShas[i] ?? c.sha);
    if (tags.length) c.tags = tags;
  });
}

function listHgBranchCommitsPage(
  hgRepo: string,
  branch: string,
  limit: number,
  offset: number,
): { commits: BranchCommit[]; hasMore: boolean } {
  const skip = Math.max(0, offset);
  const fetchCount = limit + 1;
  const out = runHg(hgRepo, [
    "log",
    "-r",
    hgBranchRevSpec(branch),
    "--template",
    "{rev}|{node}|{node|short}|{author|user}|{date|isodate}|{desc|firstline}|{join(tags, \",\")}\n",
    "-l",
    String(skip + fetchCount),
  ]);
  const all = parseHgLogOutput(out);
  const page = all.slice(skip, skip + limit);
  return { commits: page, hasMore: all.length > skip + limit };
}

/** Count changesets per Mercurial branch label from `hg log -r all()` output. */
export function tallyHgBranchLabels(logOutput: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of logOutput.split(/\r?\n/)) {
    const name = line.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

export function listGitHeads(gitRepo: string): string[] {
  const out = runGit(gitRepo, [
    "for-each-ref",
    "refs/heads/",
    "--format=%(refname)",
  ]);
  return out
    ? out.split(/\r?\n/).filter(Boolean).map((ref) => branchNameFromGitRef(ref))
    : [];
}

/** Refs to exclude so `git log` shows branch-tip commits, not full ancestry. */
export function gitLogExcludeRefsFromHeads(
  allHeads: string[],
  gitBranch: string,
  hgBranch: string | undefined,
  defaultGitBranch: string,
): string[] {
  const main = (defaultGitBranch.trim() || "master");

  if (hgBranch === "default") {
    return allHeads.filter((b) => b !== gitBranch);
  }
  if (hgBranch) {
    return main !== gitBranch ? [main] : [];
  }
  return allHeads.filter((b) => b !== gitBranch);
}

function gitLogExcludeRefs(
  gitRepo: string,
  gitBranch: string,
  hgBranch: string | undefined,
  defaultGitBranch: string,
): string[] {
  return gitLogExcludeRefsFromHeads(
    listGitHeads(gitRepo),
    gitBranch,
    hgBranch,
    defaultGitBranch,
  );
}

function listGitBranchCommitsPage(
  gitRepo: string,
  branch: string,
  limit: number,
  offset: number,
  excludeRefs: string[] = [],
): { commits: BranchCommit[]; hasMore: boolean } {
  const skip = Math.max(0, offset);
  const fetchCount = limit + 1;
  const args = [
    "log",
    branch,
    "--reverse",
    `-n`,
    String(skip + fetchCount),
    "--format=%H%x1f%h%x1f%an%x1f%ai%x1f%s",
  ];
  for (const ref of excludeRefs) {
    if (ref && ref !== branch) args.push("--not", ref);
  }
  const out = runGit(gitRepo, args);
  const lines = out.split(/\r?\n/).filter((l) => l.trim());
  const fetchLines = lines.slice(0, skip + fetchCount);
  const pageLines = fetchLines.slice(skip, skip + limit);
  const page: BranchCommit[] = [];
  const fullShas: string[] = [];
  for (const line of pageLines) {
    const parts = line.split("\x1f");
    const full = parts[0];
    const short = parts[1] ?? full?.slice(0, 12);
    if (!short) continue;
    fullShas.push(full?.toLowerCase() ?? short);
    const date = parts[3]?.trim();
    page.push({
      sha: short,
      author: parts[2] ?? "",
      message: parts[4] ?? "",
      ...(date ? { date } : {}),
    });
  }
  enrichGitCommitsWithTags(gitRepo, page, fullShas);
  return { commits: page, hasMore: lines.length > skip + limit };
}

/** Git commits that correspond to hg branch changesets (hg2git mapping). */
function gitCommitsFromHgPage(
  hgCommits: BranchCommit[],
  nodeToGit: Map<string, string>,
): BranchCommit[] {
  const out: BranchCommit[] = [];
  for (const h of hgCommits) {
    const full = h.node ? nodeToGit.get(h.node) : undefined;
    if (!full) continue;
    out.push({
      sha: full.slice(0, 12),
      author: h.author,
      message: h.message,
      ...(h.date ? { date: h.date } : {}),
    });
  }
  return out;
}

function pairsFromHgCommits(
  hgCommits: BranchCommit[],
  nodeToGit: Map<string, string>,
  gitRepo: string,
): AlignedCommitPair[] {
  const tagMap = getGitTagsBySha(gitRepo);
  return hgCommits.map((h) => {
    const full = h.node ? nodeToGit.get(h.node) : undefined;
    const gitTags = full ? gitTagsForSha(tagMap, full) : [];
    const git: BranchCommit | null = full
      ? {
          sha: full.slice(0, 12),
          author: h.author,
          message: h.message,
          ...(h.date ? { date: h.date } : {}),
          ...(gitTags.length ? { tags: gitTags } : {}),
        }
      : null;
    return { hg: h, git };
  });
}

function gitDir(gitRepo: string): string | null {
  const rel = runGit(gitRepo, ["rev-parse", "--git-dir"]);
  if (rel) {
    return path.isAbsolute(rel) ? rel : path.join(gitRepo, rel);
  }
  const fallback = path.join(gitRepo, ".git");
  return existsSync(fallback) ? fallback : null;
}

/** hg node id (full hex) → git sha via hg2git marks + mapping (cached per git repo). */
export function loadHgNodeToGitSha(gitRepo: string): Map<string, string> {
  const key = path.resolve(gitRepo);
  const cached = nodeToGitCache.get(key);
  if (cached) return cached;

  const gd = gitDir(gitRepo);
  const empty = new Map<string, string>();
  if (!gd) {
    nodeToGitCache.set(key, empty);
    return empty;
  }

  const marksPath = path.join(gd, "hg2git-marks");
  const mappingPath = path.join(gd, "hg2git-mapping");
  if (!existsSync(marksPath) || !existsSync(mappingPath)) {
    nodeToGitCache.set(key, empty);
    return empty;
  }

  /** fast-export marks file uses 1-based ids (:1, :2, …) */
  const markToSha = new Map<number, string>();
  for (const line of readFileSync(marksPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^:(\d+)\s+([0-9a-f]+)$/i);
    if (m) markToSha.set(parseInt(m[1], 10), m[2].toLowerCase());
  }

  const nodeToSha = new Map<string, string>();
  for (const line of readFileSync(mappingPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^:([0-9a-f]+)\s+(\d+)$/i);
    if (!m) continue;
    const markIdx = parseInt(m[2], 10);
    const sha =
      markToSha.get(markIdx + 1) ??
      markToSha.get(markIdx);
    if (sha) nodeToSha.set(m[1].toLowerCase(), sha);
  }

  nodeToGitCache.set(key, nodeToSha);
  return nodeToSha;
}

export function clearHgNodeToGitCache(gitRepo?: string): void {
  if (gitRepo) {
    const key = path.resolve(gitRepo);
    nodeToGitCache.delete(key);
    gitTagsByRepoCache.delete(key);
  } else {
    nodeToGitCache.clear();
    gitTagsByRepoCache.clear();
  }
}

function shasMatch(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x === y || x.startsWith(y) || y.startsWith(x);
}

function findGitBySha(
  gitCommits: BranchCommit[],
  sha: string,
  used: Set<number>,
): number {
  for (let i = 0; i < gitCommits.length; i++) {
    if (used.has(i)) continue;
    if (shasMatch(gitCommits[i].sha, sha)) return i;
  }
  return -1;
}

/** Merge in chronological order (oldest → newest); gaps when only one side has a commit. */
export function alignCommitsChronological(
  hgCommits: BranchCommit[],
  gitCommits: BranchCommit[],
  nodeToGit: Map<string, string>,
): AlignedCommitPair[] {
  const usedGit = new Set<number>();
  const pairs: AlignedCommitPair[] = [];
  let gitCursor = 0;

  for (const h of hgCommits) {
    let matchIdx = -1;
    const mappedSha = h.node ? nodeToGit.get(h.node) : undefined;
    if (mappedSha) matchIdx = findGitBySha(gitCommits, mappedSha, usedGit);
    if (matchIdx < 0 && h.sha) {
      matchIdx = findGitBySha(gitCommits, h.sha, usedGit);
    }

    if (matchIdx >= 0) {
      while (gitCursor < matchIdx) {
        if (!usedGit.has(gitCursor)) {
          pairs.push({ hg: null, git: gitCommits[gitCursor] });
          usedGit.add(gitCursor);
        }
        gitCursor++;
      }
      pairs.push({ hg: h, git: gitCommits[matchIdx] });
      usedGit.add(matchIdx);
      gitCursor = matchIdx + 1;
    } else {
      pairs.push({ hg: h, git: null });
    }
  }

  while (gitCursor < gitCommits.length) {
    if (!usedGit.has(gitCursor)) {
      pairs.push({ hg: null, git: gitCommits[gitCursor] });
      usedGit.add(gitCursor);
    }
    gitCursor++;
  }

  return pairs;
}

export function getBranchHistory(
  hgRepo: string,
  gitRepo: string,
  opts: {
    hgBranch?: string;
    gitBranch?: string;
    defaultBranch?: string;
    limit?: number;
    offset?: number;
  },
): BranchHistoryResult {
  const limit = Math.min(50, Math.max(1, opts.limit ?? 10));
  const offset = Math.max(0, opts.offset ?? 0);
  const hgBranch = opts.hgBranch?.trim();
  const gitBranch = opts.gitBranch?.trim();
  const defaultGitBranch = opts.defaultBranch?.trim() || "master";

  const hgPage = hgBranch
    ? listHgBranchCommitsPage(hgRepo, hgBranch, limit, offset)
    : { commits: [], hasMore: false };

  let pairs: AlignedCommitPair[];
  let hasMoreGit = false;

  if (hgBranch && gitBranch) {
    const nodeToGit = loadHgNodeToGitSha(gitRepo);
    pairs = pairsFromHgCommits(hgPage.commits, nodeToGit, gitRepo);
    hasMoreGit = hgPage.hasMore;
  } else if (hgBranch) {
    pairs = hgPage.commits.map((h) => ({ hg: h, git: null }));
    hasMoreGit = false;
  } else if (gitBranch) {
    const excludes = gitLogExcludeRefs(
      gitRepo,
      gitBranch,
      undefined,
      defaultGitBranch,
    );
    const gitPage = listGitBranchCommitsPage(
      gitRepo,
      gitBranch,
      limit,
      offset,
      excludes,
    );
    pairs = gitPage.commits.map((g) => ({ hg: null, git: g }));
    hasMoreGit = gitPage.hasMore;
  } else {
    pairs = [];
  }

  return {
    hgBranch,
    gitBranch,
    pairs,
    limit,
    offset,
    hasMoreHg: hgPage.hasMore,
    hasMoreGit,
  };
}
