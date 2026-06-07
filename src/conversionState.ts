import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const HG2GIT_STATE_PREFIX = "hg2git";

export function hg2gitStatePath(gitDirPath: string): string {
  return path.join(gitDirPath, `${HG2GIT_STATE_PREFIX}-state`);
}

export function hg2gitMappingPath(gitDirPath: string): string {
  return path.join(gitDirPath, `${HG2GIT_STATE_PREFIX}-mapping`);
}

export function hg2gitMarksPath(gitDirPath: string): string {
  return path.join(gitDirPath, `${HG2GIT_STATE_PREFIX}-marks`);
}

export function countMappingEntries(content: string): number {
  let n = 0;
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith(":")) n++;
  }
  return n;
}

export function parseImportedTipFromState(content: string): {
  tip: number;
  hgRepo?: string;
} {
  let tip = 0;
  let hgRepo: string | undefined;
  for (const line of content.split(/\r?\n/)) {
    const tipMatch = line.match(/^:tip\s+(\d+)/);
    if (tipMatch) tip = parseInt(tipMatch[1], 10);
    const repoMatch = line.match(/^:repo\s+(.+)$/);
    if (repoMatch) hgRepo = repoMatch[1].trim();
  }
  return { tip, hgRepo };
}

/** hg-fast-export `:tip` — next rev index / exclusive export bound. */
export function readImportedTip(gitDirPath: string): number {
  const statePath = hg2gitStatePath(gitDirPath);
  if (existsSync(statePath)) {
    const { tip } = parseImportedTipFromState(readFileSync(statePath, "utf8"));
    if (tip > 0) return tip;
  }

  const mappingPath = hg2gitMappingPath(gitDirPath);
  if (!existsSync(mappingPath)) return 0;
  return countMappingEntries(readFileSync(mappingPath, "utf8"));
}

export function hasResumableConversion(gitDirPath: string): boolean {
  if (readImportedTip(gitDirPath) > 0) return true;

  const marksPath = hg2gitMarksPath(gitDirPath);
  if (!existsSync(marksPath)) return false;
  return readFileSync(marksPath, "utf8").trim().length > 0;
}

const ARTIFACT_SUFFIXES = ["state", "marks", "mapping", "heads"] as const;

/** Restore missing hg2git artifacts from fast-export `~` backups when present. */
export function recoverConversionArtifactsFromBackup(
  gitDirPath: string,
): boolean {
  let recovered = false;
  for (const suffix of ARTIFACT_SUFFIXES) {
    const file = path.join(gitDirPath, `${HG2GIT_STATE_PREFIX}-${suffix}`);
    const backup = `${file}~`;
    if (!existsSync(file) && existsSync(backup)) {
      copyFileSync(backup, file);
      recovered = true;
    }
  }
  return recovered;
}

/**
 * Recreate a missing hg2git-state from mapping/marks after an interrupted import.
 * Returns true when a new state file was written.
 */
export function ensureConversionStateBootstrap(
  gitDirPath: string,
  hgRepo: string,
): boolean {
  recoverConversionArtifactsFromBackup(gitDirPath);

  const statePath = hg2gitStatePath(gitDirPath);
  if (existsSync(statePath)) return false;

  const tip = readImportedTip(gitDirPath);
  if (tip <= 0) return false;

  const lines = [`:tip ${tip}`, `:repo ${path.resolve(hgRepo.trim())}`];
  writeFileSync(statePath, lines.join("\n") + "\n", "utf8");
  return true;
}
