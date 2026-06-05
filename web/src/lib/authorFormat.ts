import type { AuthorMappingEntry } from "../types";

export function gitIdentityFromEntry(entry: AuthorMappingEntry): string | undefined {
  const explicit = entry.gitIdentity?.trim();
  if (explicit) return explicit;
  const name = entry.gitName?.trim();
  const email = entry.gitEmail?.trim();
  if (name && email) return `${name} <${email}>`;
  if (email) return email;
  if (name) return name;
  return undefined;
}

export function isAuthorMappingComplete(entry: AuthorMappingEntry): boolean {
  return Boolean(gitIdentityFromEntry(entry));
}
