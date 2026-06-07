import type { Project, ProjectsState } from "./server/projects.js";

export const MAX_RECENT_PROJECTS = 10;

export function projectIsSavedToDisk(project: Project | undefined): boolean {
  return Boolean(project?.projectFile?.trim());
}

export function applyRecent(
  state: ProjectsState,
  projectId: string,
): ProjectsState {
  const project = state.projects.find((p) => p.id === projectId);
  if (!projectIsSavedToDisk(project)) return state;

  const prev = state.recentProjectIds ?? [];
  const recentProjectIds = [
    projectId,
    ...prev.filter((id) => id !== projectId),
  ].slice(0, MAX_RECENT_PROJECTS);
  return { ...state, recentProjectIds };
}

export function pruneRecentProjectIds(state: ProjectsState): ProjectsState {
  const byId = new Map(state.projects.map((p) => [p.id, p]));
  const recentProjectIds = (state.recentProjectIds ?? []).filter((id) =>
    projectIsSavedToDisk(byId.get(id)),
  );
  return { ...state, recentProjectIds };
}

/** Seed Recent from saved projects when the list was lost (e.g. older writes). */
export function ensureRecentPopulated(state: ProjectsState): ProjectsState {
  const pruned = pruneRecentProjectIds(state);
  if ((pruned.recentProjectIds ?? []).length > 0) return pruned;

  const savedIds = pruned.projects
    .filter(projectIsSavedToDisk)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_RECENT_PROJECTS)
    .map((p) => p.id);

  if (savedIds.length === 0) return pruned;
  return { ...pruned, recentProjectIds: savedIds };
}

export function getRecentProjects(state: ProjectsState): Project[] {
  const byId = new Map(state.projects.map((p) => [p.id, p]));
  return (state.recentProjectIds ?? [])
    .map((id) => byId.get(id))
    .filter((p): p is Project => projectIsSavedToDisk(p));
}
