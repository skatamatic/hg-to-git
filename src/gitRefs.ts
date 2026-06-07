/** Strip `refs/heads/` without Git's tag-disambiguation prefix (`heads/name`). */
export function branchNameFromGitRef(ref: string): string {
  const prefix = "refs/heads/";
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : ref;
}

/** Strip `refs/tags/` without Git's branch-disambiguation prefix (`tags/name`). */
export function tagNameFromGitRef(ref: string): string {
  const prefix = "refs/tags/";
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : ref;
}
