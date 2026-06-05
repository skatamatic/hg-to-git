import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadUiSettings, type UiSettings } from "./persist.js";

export interface AuthorMappingEntry {
  hgAuthor: string;
  gitName?: string;
  gitEmail?: string;
  gitIdentity?: string;
}

export interface Project {
  id: string;
  name: string;
  hgRepo: string;
  gitRepo: string;
  /** Legacy path to an external authors.map file. */
  authorsMap?: string;
  /** In-app author mappings (written to .hg-to-git/authors.map on convert). */
  authorMappings?: AuthorMappingEntry[];
  defaultBranch?: string;
  checkoutWorkingTree?: boolean;
  simpleMode?: boolean;
  /** @deprecated Migrated to checkoutWorkingTree */
  checkoutBranch?: string;
  lastRunAt?: string;
  lastRunStatus?: "success" | "error" | "idle";
  createdAt: string;
  updatedAt: string;
}

export interface ProjectsState {
  version: 1;
  lastProjectId: string | null;
  projects: Project[];
}

function stateDir(): string {
  const file = process.env.HG_TO_GIT_UI_STATE;
  if (file) return path.dirname(file);
  return path.join(
    process.env.LOCALAPPDATA ?? process.env.HOME ?? ".",
    "hg-to-git",
  );
}

function projectsPath(): string {
  return path.join(stateDir(), "projects.json");
}

const EMPTY: ProjectsState = { version: 1, lastProjectId: null, projects: [] };

function now() {
  return new Date().toISOString();
}

function normalizeProject(project: Project): Project {
  const checkoutWorkingTree = project.checkoutWorkingTree ?? true;
  const { checkoutBranch: _legacy, ...rest } = project;
  return { ...rest, checkoutWorkingTree };
}

function projectName(hgRepo: string, gitRepo: string): string {
  const pick = (p: string) => p.replace(/^.*[/\\]/, "").trim() || p.trim();
  const a = pick(hgRepo);
  const b = pick(gitRepo);
  if (a && b && a !== b) return `${a} → ${b}`;
  return a || b || "Untitled project";
}

async function migrateFromLegacySettings(
  state: ProjectsState,
): Promise<ProjectsState> {
  if (state.projects.length > 0) return state;
  const legacy = await loadUiSettings();
  if (!legacy.hgRepo?.trim() && !legacy.gitRepo?.trim()) return state;

  const t = now();
  const project: Project = {
    id: randomUUID(),
    name: projectName(legacy.hgRepo, legacy.gitRepo),
    hgRepo: legacy.hgRepo,
    gitRepo: legacy.gitRepo,
    authorsMap: legacy.authorsMap,
    defaultBranch: legacy.defaultBranch ?? "master",
    checkoutWorkingTree: legacy.checkoutWorkingTree ?? true,
    lastRunAt: legacy.lastRunAt,
    lastRunStatus: legacy.lastRunStatus,
    createdAt: t,
    updatedAt: t,
  };
  return {
    version: 1,
    lastProjectId: project.id,
    projects: [project],
  };
}

export async function loadProjectsState(): Promise<ProjectsState> {
  const file = projectsPath();
  let state: ProjectsState = { ...EMPTY };
  if (existsSync(file)) {
    try {
      const raw = await readFile(file, "utf8");
      const parsed = JSON.parse(raw) as ProjectsState;
      if (parsed.version === 1 && Array.isArray(parsed.projects)) {
        state = {
          version: 1,
          lastProjectId: parsed.lastProjectId ?? null,
          projects: parsed.projects.map(normalizeProject),
        };
      }
    } catch {
      /* use empty */
    }
  }
  const migrated = await migrateFromLegacySettings(state);
  if (migrated.projects.length !== state.projects.length) {
    await writeProjectsState(migrated);
  }
  return migrated;
}

async function writeProjectsState(state: ProjectsState): Promise<void> {
  const file = projectsPath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(state, null, 2) + "\n", "utf8");
}

export function getActiveProject(state: ProjectsState): Project | null {
  if (!state.lastProjectId) return null;
  return state.projects.find((p) => p.id === state.lastProjectId) ?? null;
}

export async function apiGetProjectsState(): Promise<ProjectsState> {
  return loadProjectsState();
}

export async function apiCreateProject(input?: {
  name?: string;
  hgRepo?: string;
  gitRepo?: string;
}): Promise<{ state: ProjectsState; project: Project }> {
  const state = await loadProjectsState();
  const t = now();
  const project: Project = {
    id: randomUUID(),
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
  await writeProjectsState(next);
  return { state: next, project };
}

export async function apiOpenProject(id: string): Promise<ProjectsState> {
  const state = await loadProjectsState();
  const project = state.projects.find((p) => p.id === id);
  if (!project) throw new Error("Project not found");
  const next = { ...state, lastProjectId: id };
  await writeProjectsState(next);
  return next;
}

export async function apiSaveProject(
  id: string,
  partial: Partial<Project>,
): Promise<{ state: ProjectsState; project: Project }> {
  const state = await loadProjectsState();
  const idx = state.projects.findIndex((p) => p.id === id);
  if (idx < 0) throw new Error("Project not found");

  const current = state.projects[idx]!;
  const updated = normalizeProject({
    ...current,
    ...partial,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: now(),
  });
  if (partial.hgRepo !== undefined || partial.gitRepo !== undefined) {
    const hg = partial.hgRepo ?? updated.hgRepo;
    const git = partial.gitRepo ?? updated.gitRepo;
    if (!partial.name && (partial.hgRepo !== undefined || partial.gitRepo !== undefined)) {
      updated.name = projectName(hg, git);
    }
  }

  const projects = [...state.projects];
  projects[idx] = updated;
  const next: ProjectsState = {
    version: 1,
    lastProjectId: state.lastProjectId ?? id,
    projects,
  };
  await writeProjectsState(next);
  return { state: next, project: updated };
}

export async function apiDeleteProject(id: string): Promise<ProjectsState> {
  const state = await loadProjectsState();
  const projects = state.projects.filter((p) => p.id !== id);
  let lastProjectId = state.lastProjectId;
  if (lastProjectId === id) {
    lastProjectId = projects[0]?.id ?? null;
  }
  const next: ProjectsState = { version: 1, lastProjectId, projects };
  await writeProjectsState(next);
  return next;
}

/** Sync legacy ui-settings.json for older code paths. */
export async function syncLegacySettingsFromProject(
  project: Project,
): Promise<UiSettings> {
  const { saveUiSettings } = await import("./persist.js");
  return saveUiSettings({
    hgRepo: project.hgRepo,
    gitRepo: project.gitRepo,
    authorsMap: project.authorsMap,
    defaultBranch: project.defaultBranch,
    checkoutWorkingTree: project.checkoutWorkingTree,
    simpleMode: project.simpleMode,
    lastRunAt: project.lastRunAt,
    lastRunStatus: project.lastRunStatus,
  });
}

export async function apiUpdateActiveProjectRun(
  status: "success" | "error",
  fields?: Partial<Project>,
): Promise<void> {
  const state = await loadProjectsState();
  const id = state.lastProjectId;
  if (!id) return;
  const idx = state.projects.findIndex((p) => p.id === id);
  if (idx < 0) return;

  const current = state.projects[idx]!;
  const updated: Project = {
    ...current,
    ...fields,
    lastRunAt: new Date().toISOString(),
    lastRunStatus: status,
    updatedAt: now(),
  };
  const projects = [...state.projects];
  projects[idx] = updated;
  await writeProjectsState({
    version: 1,
    lastProjectId: id,
    projects,
  });
  await syncLegacySettingsFromProject(updated);
}
