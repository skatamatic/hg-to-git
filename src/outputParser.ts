export type LogLevel = "info" | "progress" | "warn" | "error" | "success";

export interface ParsedLogLine {
  level: LogLevel;
  message: string;
  raw: string;
  /** hg revision current (1-based in export message) */
  revisionCurrent?: number;
  revisionMax?: number;
  branch?: string;
  filesCurrent?: number;
  filesMax?: number;
  tagsExported?: number;
}

const REV_PROGRESS =
  /Exporting .+ revision (\d+)\/(\d+) with (\d+)\/(\d+)/i;
const FILES_PROGRESS = /Exported (\d+)\/(\d+) files/i;
const BRANCH_EXPORT = /^([^:]+): Exporting/i;

export function parseOutputLine(raw: string): ParsedLogLine {
  const message = raw.trim();
  if (!message) {
    return { level: "info", message: "", raw };
  }

  let level: LogLevel = "info";
  if (/^error:/i.test(message) || /^fatal:/i.test(message)) {
    level = "error";
  } else if (/^warning:/i.test(message) || /sanitized/i.test(message)) {
    level = "warn";
  } else if (
    REV_PROGRESS.test(message) ||
    FILES_PROGRESS.test(message) ||
    /exporting tag/i.test(message)
  ) {
    level = "progress";
  } else if (/issued \d+ commands/i.test(message) || /complete/i.test(message)) {
    level = "success";
  }

  const rev = REV_PROGRESS.exec(message);
  if (rev) {
    const branchMatch = BRANCH_EXPORT.exec(message);
    return {
      level: "progress",
      message,
      raw,
      revisionCurrent: parseInt(rev[1], 10),
      revisionMax: parseInt(rev[2], 10),
      filesCurrent: parseInt(rev[3], 10),
      filesMax: parseInt(rev[4], 10),
      branch: branchMatch?.[1]?.trim(),
    };
  }

  const files = FILES_PROGRESS.exec(message);
  if (files) {
    return {
      level: "progress",
      message,
      raw,
      filesCurrent: parseInt(files[1], 10),
      filesMax: parseInt(files[2], 10),
    };
  }

  const tag = /Exporting tag \[([^\]]+)\]/i.exec(message);
  if (tag) {
    return {
      level: "progress",
      message,
      raw,
      branch: tag[1],
    };
  }

  return { level, message, raw };
}

export function aggregateProgress(
  lines: ParsedLogLine[],
): { percent: number; label: string } | null {
  const lastRev = [...lines].reverse().find((l) => l.revisionMax != null);
  if (lastRev?.revisionMax && lastRev.revisionCurrent != null) {
    const percent = Math.min(
      100,
      Math.round((lastRev.revisionCurrent / lastRev.revisionMax) * 100),
    );
    const branch = lastRev.branch ? ` · ${lastRev.branch}` : "";
    return {
      percent,
      label: `Revision ${lastRev.revisionCurrent} / ${lastRev.revisionMax}${branch}`,
    };
  }
  return null;
}
