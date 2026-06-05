import type { Project, ProjectsState } from "../types";

const KEY = "hg-to-git-projects";

function now() {
  return new Date().toISOString();
}

function newId() {
  return crypto.randomUUID();
}

export function loadLocalProjects(): ProjectsState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { version: 1, lastProjectId: null, projects: [] };
    const parsed = JSON.parse(raw) as ProjectsState;
    if (parsed.version === 1 && Array.isArray(parsed.projects)) {
      return {
        version: 1,
        lastProjectId: parsed.lastProjectId ?? null,
        projects: parsed.projects,
      };
    }
  } catch {
    /* */
  }
  return { version: 1, lastProjectId: null, projects: [] };
}

export function saveLocalProjects(state: ProjectsState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function localCreateProject(input?: {
  name?: string;
  hgRepo?: string;
  gitRepo?: string;
}): { state: ProjectsState; project: Project } {
  const state = loadLocalProjects();
  const t = now();
  const project: Project = {
    id: newId(),
    name: input?.name?.trim() || "New project",
    hgRepo: input?.hgRepo?.trim() ?? "",
    gitRepo: input?.gitRepo?.trim() ?? "",
    defaultBranch: "master",
    checkoutWorkingTree: true,
    createdAt: t,
    updatedAt: t,
  };
  const next: ProjectsState = {
    version: 1,
    lastProjectId: project.id,
    projects: [project, ...state.projects],
  };
  saveLocalProjects(next);
  return { state: next, project };
}

export function localOpenProject(id: string): ProjectsState {
  const state = loadLocalProjects();
  if (!state.projects.some((p) => p.id === id)) {
    throw new Error("Project not found");
  }
  const next = { ...state, lastProjectId: id };
  saveLocalProjects(next);
  return next;
}

export function localSaveProject(
  id: string,
  partial: Partial<Project>,
): { state: ProjectsState; project: Project } {
  const state = loadLocalProjects();
  const idx = state.projects.findIndex((p) => p.id === id);
  if (idx < 0) throw new Error("Project not found");
  const current = state.projects[idx]!;
  const project: Project = {
    ...current,
    ...partial,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: now(),
  };
  const projects = [...state.projects];
  projects[idx] = project;
  const next: ProjectsState = {
    version: 1,
    lastProjectId: state.lastProjectId ?? id,
    projects,
  };
  saveLocalProjects(next);
  return { state: next, project };
}

export function localDeleteProject(id: string): ProjectsState {
  const state = loadLocalProjects();
  const projects = state.projects.filter((p) => p.id !== id);
  let lastProjectId = state.lastProjectId;
  if (lastProjectId === id) lastProjectId = projects[0]?.id ?? null;
  const next: ProjectsState = { version: 1, lastProjectId, projects };
  saveLocalProjects(next);
  return next;
}
