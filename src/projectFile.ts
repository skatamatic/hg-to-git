import type { Project } from "./server/projects.js";

export const PROJECT_FILE_SUFFIX = ".hg-to-git-project.json";

export interface ProjectFilePayload {
  version: 1;
  name: string;
  hgRepo: string;
  gitRepo: string;
  defaultBranch?: string;
  checkoutWorkingTree?: boolean;
  simpleMode?: boolean;
}

export function defaultProjectFileName(name: string): string {
  const base =
    name
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .replace(/\s+/g, " ")
      .trim() || "project";
  return `${base}${PROJECT_FILE_SUFFIX}`;
}

export function serializeProjectFile(project: Project): string {
  const payload: ProjectFilePayload = {
    version: 1,
    name: project.name,
    hgRepo: project.hgRepo,
    gitRepo: project.gitRepo,
    defaultBranch: project.defaultBranch ?? "master",
    checkoutWorkingTree: project.checkoutWorkingTree ?? true,
    simpleMode: project.simpleMode,
  };
  return JSON.stringify(payload, null, 2) + "\n";
}

export function parseProjectFile(raw: string): Omit<
  Project,
  "id" | "createdAt" | "updatedAt" | "lastRunAt" | "lastRunStatus" | "projectFile"
> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Project file is not valid JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Project file is empty or invalid");
  }

  const data = parsed as Partial<ProjectFilePayload>;
  if (data.version !== 1) {
    throw new Error(`Unsupported project file version: ${String(data.version)}`);
  }

  const name = String(data.name ?? "").trim();
  const hgRepo = String(data.hgRepo ?? "").trim();
  const gitRepo = String(data.gitRepo ?? "").trim();
  if (!name) throw new Error("Project file is missing a name");
  if (!hgRepo) throw new Error("Project file is missing the Mercurial repository path");
  if (!gitRepo) throw new Error("Project file is missing the Git repository path");

  return {
    name,
    hgRepo,
    gitRepo,
    defaultBranch: data.defaultBranch?.trim() || "master",
    checkoutWorkingTree: data.checkoutWorkingTree ?? true,
    simpleMode: data.simpleMode,
  };
}
