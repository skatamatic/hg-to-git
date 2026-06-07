import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  parseProjectFile,
  serializeProjectFile,
} from "../projectFile.js";
import { loadUiSettings, type UiSettings } from "./persist.js";
import {
  applyRecent,
  ensureRecentPopulated,
  getRecentProjects,
  MAX_RECENT_PROJECTS,
  pruneRecentProjectIds,
} from "../projectRecent.js";

export { getRecentProjects, MAX_RECENT_PROJECTS };

export interface Project {
  id: string;
  name: string;
  hgRepo: string;
  gitRepo: string;
  defaultBranch?: string;
  checkoutWorkingTree?: boolean;
  simpleMode?: boolean;
  /** @deprecated Migrated to checkoutWorkingTree */
  checkoutBranch?: string;
  lastRunAt?: string;
  lastRunStatus?: "success" | "error" | "idle";
  /** Last path used for Save / Load project file on disk. */
  projectFile?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectsState {
  version: 1;
  lastProjectId: string | null;
  projects: Project[];
  recentProjectIds?: string[];
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

const EMPTY: ProjectsState = {
  version: 1,
  lastProjectId: null,
  projects: [],
  recentProjectIds: [],
};

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
    recentProjectIds: [],
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
          recentProjectIds: Array.isArray(parsed.recentProjectIds)
            ? parsed.recentProjectIds
            : [],
        };
      }
    } catch {
      /* use empty */
    }
  }
  const migrated = await migrateFromLegacySettings(state);
  const populated = ensureRecentPopulated(migrated);
  if (
    migrated.projects.length !== state.projects.length ||
    populated.recentProjectIds?.length !== migrated.recentProjectIds?.length
  ) {
    await writeProjectsState(populated);
  }
  return populated;
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
    recentProjectIds: state.recentProjectIds,
  };
  await writeProjectsState(next);
  return { state: next, project };
}

export async function apiOpenProject(id: string): Promise<ProjectsState> {
  const state = await loadProjectsState();
  const project = state.projects.find((p) => p.id === id);
  if (!project) throw new Error("Project not found");
  const next = applyRecent({ ...state, lastProjectId: id }, id);
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
    recentProjectIds: state.recentProjectIds,
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
  const recentProjectIds = (state.recentProjectIds ?? []).filter(
    (recentId) => recentId !== id,
  );
  const next: ProjectsState = {
    version: 1,
    lastProjectId,
    projects,
    recentProjectIds,
  };
  await writeProjectsState(next);
  return next;
}

export async function apiImportProjectFromFile(
  filePath: string,
): Promise<{ state: ProjectsState; project: Project }> {
  const normalizedPath = path.resolve(filePath.trim());
  if (!existsSync(normalizedPath)) {
    throw new Error("Project file not found");
  }

  const raw = await readFile(normalizedPath, "utf8");
  const data = parseProjectFile(raw);
  const state = await loadProjectsState();
  const t = now();

  const existing = state.projects.find((p) => p.projectFile === normalizedPath);
  if (existing) {
    const updated = normalizeProject({
      ...existing,
      ...data,
      projectFile: normalizedPath,
      updatedAt: t,
    });
    const projects = state.projects.map((p) =>
      p.id === existing.id ? updated : p,
    );
    const next = applyRecent(
      {
        version: 1,
        lastProjectId: existing.id,
        projects,
        recentProjectIds: state.recentProjectIds,
      },
      existing.id,
    );
    await writeProjectsState(next);
    await syncLegacySettingsFromProject(updated);
    return { state: next, project: updated };
  }

  const project = normalizeProject({
    id: randomUUID(),
    ...data,
    projectFile: normalizedPath,
    createdAt: t,
    updatedAt: t,
  });
  const next = applyRecent(
    {
      version: 1,
      lastProjectId: project.id,
      projects: [project, ...state.projects],
      recentProjectIds: state.recentProjectIds,
    },
    project.id,
  );
  await writeProjectsState(next);
  await syncLegacySettingsFromProject(project);
  return { state: next, project };
}

export async function apiSaveProjectToFile(
  id: string,
  filePath: string,
  partial?: Partial<Project>,
): Promise<{ state: ProjectsState; project: Project }> {
  const saved = partial
    ? await apiSaveProject(id, partial)
    : await (async () => {
        const state = await loadProjectsState();
        const project = state.projects.find((p) => p.id === id);
        if (!project) throw new Error("Project not found");
        return { state, project };
      })();

  const normalizedPath = path.resolve(filePath.trim());
  await mkdir(path.dirname(normalizedPath), { recursive: true });
  await writeFile(
    normalizedPath,
    serializeProjectFile(saved.project),
    "utf8",
  );

  const withPath = await apiSaveProject(id, { projectFile: normalizedPath });
  const next = applyRecent(withPath.state, id);
  await writeProjectsState(next);
  return { state: next, project: withPath.project };
}

/** Sync legacy ui-settings.json for older code paths. */
export async function syncLegacySettingsFromProject(
  project: Project,
): Promise<UiSettings> {
  const { saveUiSettings } = await import("./persist.js");
  return saveUiSettings({
    hgRepo: project.hgRepo,
    gitRepo: project.gitRepo,
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
    recentProjectIds: state.recentProjectIds,
  });
  await syncLegacySettingsFromProject(updated);
}
