import type { LogEntry } from "../types";

export function progressFromLogs(
  logs: LogEntry[],
): { percent: number; label: string } {
  const rev = [...logs].reverse().find((l) => l.revisionMax != null);
  if (rev?.revisionMax && rev.revisionCurrent != null) {
    return {
      percent: Math.min(
        100,
        Math.round((rev.revisionCurrent / rev.revisionMax) * 100),
      ),
      label: `Revision ${rev.revisionCurrent} of ${rev.revisionMax}${
        rev.branch ? ` on ${rev.branch}` : ""
      }`,
    };
  }
  return { percent: 0, label: "" };
}
