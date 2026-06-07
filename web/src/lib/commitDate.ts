/** Format hg/git date strings for commit rows. */
export function formatCommitDate(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const d = new Date(raw.trim());
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 1971) return undefined;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCommitAuthorLine(author?: string, date?: string): string {
  const name = author?.trim() || "Unknown author";
  const when = formatCommitDate(date);
  return when ? `${name} - ${when}` : name;
}
