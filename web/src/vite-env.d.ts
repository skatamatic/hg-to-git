/// <reference types="vite/client" />

import type {
  AuthorMappingEntry,
  HgAuthorScanRow,
  Project,
  ProjectsState,
  ToolchainReport,
} from "./types";

interface HgToGitBridge {
  isElectron: true;
  platform: NodeJS.Platform;
  syncThemeChrome: (theme: "light" | "dark") => Promise<{ ok: boolean }>;
  getProjects: () => Promise<ProjectsState>;
  createProject: (input?: {
    name?: string;
    hgRepo?: string;
    gitRepo?: string;
  }) => Promise<{ state: ProjectsState; project: Project }>;
  openProject: (id: string) => Promise<ProjectsState>;
  saveProject: (
    id: string,
    partial: Partial<Project>,
  ) => Promise<{ state: ProjectsState; project: Project }>;
  deleteProject: (id: string) => Promise<ProjectsState>;
  syncMenu: (state: unknown) => Promise<void>;
  checkToolchain: () => Promise<ToolchainReport>;
  installToolchain: (
    toolIds: string[],
    onLog: (message: string) => void,
  ) => Promise<{ ok: boolean; report: ToolchainReport; logs: string[] }>;
  getSnapshot: (
    hgRepo: string,
    gitRepo: string,
    options?: {
      defaultBranch?: string;
      branchesMap?: string;
      onProgress?: (detail: string) => void;
    },
  ) => Promise<unknown>;
  getBranchHistory: (
    hgRepo: string,
    gitRepo: string,
    query: {
      hgBranch?: string;
      gitBranch?: string;
      defaultBranch?: string;
      limit?: number;
      offset?: number;
    },
  ) => Promise<unknown>;
  scanHgAuthors: (hgRepo: string) => Promise<HgAuthorScanRow[]>;
  importAuthorsMap: (filePath: string) => Promise<AuthorMappingEntry[]>;
  validate: (body: unknown) => Promise<unknown>;
  fixGitIgnoreCase: (gitRepo: string) => Promise<{
    ok: boolean;
    error?: string;
    ignoreCase?: { enabled: boolean; problematic: boolean; message?: string };
  }>;
  resetGitTarget: (gitRepo: string) => Promise<{
    ok: boolean;
    error?: string;
    gitTarget?: { empty: boolean; problematic: boolean; foreignBranches: string[] };
  }>;
  pickPath: (options: {
    kind: "directory" | "file";
    title?: string;
    defaultPath?: string;
  }) => Promise<{ path: string | null; cancelled: boolean; error?: string }>;
  convert: (
    body: Record<string, unknown>,
    onLog: (data: Record<string, unknown>) => void,
    onSnapshotProgress?: (detail: string) => void,
  ) => Promise<{
    ok: boolean;
    result?: unknown;
    snapshot?: unknown;
    error?: string;
  }>;
  onAppCommand: (
    handler: (payload: { command: string; payload?: unknown }) => void,
  ) => () => void;
  onRequestExit: (handler: () => void) => () => void;
  confirmQuit: () => Promise<{ ok: boolean }>;
}

declare global {
  interface Window {
    hgToGit?: HgToGitBridge;
  }
}

export {};
