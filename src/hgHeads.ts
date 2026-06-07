import { spawnSync } from "node:child_process";
import { getResolvedTools } from "./deps/resolveTools.js";

function runHg(hgRepo: string, args: string[]): string {
  const hg = getResolvedTools().hg;
  if (!hg) return "";
  const r = spawnSync(hg, ["-R", hgRepo, ...args], {
    encoding: "utf8",
    windowsHide: true,
    env: process.env,
  });
  return ((r.stdout ?? "") + (r.stderr ?? "")).trim();
}

/** Revisions that hg-fast-export treats as unnamed heads (extra tips on one branch). */
export function parseUnnamedHeadRevisions(
  lines: { rev: number; branch: string }[],
): number[] {
  const seen = new Set<string>();
  const unnamed: number[] = [];
  for (const { rev, branch } of lines) {
    if (seen.has(branch)) {
      unnamed.push(rev);
    } else {
      seen.add(branch);
    }
  }
  return unnamed;
}

export function listUnnamedHgHeadRevisions(hgRepo: string): number[] {
  const out = runHg(hgRepo, [
    "heads",
    "-T",
    "{rev}\t{branch}\n",
  ]);
  if (!out) return [];
  const lines: { rev: number; branch: string }[] = [];
  for (const row of out.split(/\r?\n/)) {
    if (!row.trim()) continue;
    const tab = row.indexOf("\t");
    if (tab < 0) continue;
    const rev = parseInt(row.slice(0, tab), 10);
    const branch = row.slice(tab + 1).trim();
    if (!Number.isFinite(rev) || !branch) continue;
    lines.push({ rev, branch });
  }
  return parseUnnamedHeadRevisions(lines);
}
