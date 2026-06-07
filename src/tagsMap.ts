import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { listHgTagNames } from "./repoInfo.js";
import {
  mergeTagsMap,
  parseTagsMapFile,
  serializeTagsMap,
} from "./tagMapping.js";

export function defaultTagsMapPath(gitRepo: string): string {
  return path.join(gitRepo, ".hg-to-git", "tags.map");
}

/** Write/update `.hg-to-git/tags.map` from hg tags and any existing entries. */
export async function ensureTagsMapForConvert(opts: {
  gitRepo: string;
  hgRepo: string;
  /** Optional user-provided map path (merged into generated file). */
  tagsMap?: string;
}): Promise<string | undefined> {
  const gitRepo = opts.gitRepo?.trim();
  const hgRepo = opts.hgRepo?.trim();
  if (!gitRepo || !hgRepo) return undefined;

  const hgNames = listHgTagNames(hgRepo);
  if (hgNames.length === 0) return undefined;

  const outPath = opts.tagsMap?.trim()
    ? path.resolve(opts.tagsMap)
    : defaultTagsMapPath(gitRepo);

  const existing = parseTagsMapFile(outPath);
  if (opts.tagsMap?.trim() && opts.tagsMap !== outPath) {
    for (const [hg, git] of parseTagsMapFile(path.resolve(opts.tagsMap))) {
      existing.set(hg, git);
    }
  }

  const merged = mergeTagsMap(hgNames, existing);

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, serializeTagsMap(merged), "utf8");
  return outPath;
}
