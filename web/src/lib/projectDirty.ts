import type { AuthorMappingEntry, Project } from "../types";

function mappingsKey(m?: AuthorMappingEntry[]): string {
  return JSON.stringify(m ?? []);
}

/** Fields edited in Setup / toolbar (excludes run metadata). */
export function projectDraftPartial(project: Project): Partial<Project> {
  return {
    name: project.name,
    hgRepo: project.hgRepo,
    gitRepo: project.gitRepo,
    authorsMap: project.authorsMap,
    authorMappings: project.authorMappings,
    defaultBranch: project.defaultBranch,
    checkoutWorkingTree: project.checkoutWorkingTree,
    simpleMode: project.simpleMode,
  };
}

export function projectHasUnsavedChanges(
  draft: Project | null,
  saved: Project | null,
): boolean {
  if (!draft || !saved) return false;
  return (
    draft.name !== saved.name ||
    draft.hgRepo !== saved.hgRepo ||
    draft.gitRepo !== saved.gitRepo ||
    (draft.authorsMap ?? "") !== (saved.authorsMap ?? "") ||
    mappingsKey(draft.authorMappings) !== mappingsKey(saved.authorMappings) ||
    (draft.defaultBranch ?? "master") !== (saved.defaultBranch ?? "master") ||
    (draft.checkoutWorkingTree !== false) !==
      (saved.checkoutWorkingTree !== false) ||
    Boolean(draft.simpleMode) !== Boolean(saved.simpleMode)
  );
}
