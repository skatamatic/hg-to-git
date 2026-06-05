import { contextBridge, ipcRenderer } from "electron";



const bridge = {

  isElectron: true as const,

  platform: process.platform,

  syncThemeChrome: (theme: "light" | "dark") =>
    ipcRenderer.invoke("window:sync-theme", theme),

  getProjects: () => ipcRenderer.invoke("projects:get"),

  createProject: (input?: unknown) => ipcRenderer.invoke("projects:create", input),

  openProject: (id: string) => ipcRenderer.invoke("projects:open", id),

  saveProject: (id: string, partial: unknown) =>

    ipcRenderer.invoke("projects:save", { id, partial }),

  deleteProject: (id: string) => ipcRenderer.invoke("projects:delete", id),

  syncMenu: (state: unknown) => ipcRenderer.invoke("menu:sync", state),

  checkToolchain: () => ipcRenderer.invoke("deps:check"),

  installToolchain: (toolIds: string[], onLog: (message: string) => void) => {
    const handler = (_: unknown, data: { message: string }) => onLog(data.message);
    ipcRenderer.on("deps:log", handler);
    return ipcRenderer.invoke("deps:install", toolIds).finally(() => {
      ipcRenderer.removeListener("deps:log", handler);
    });
  },

  getSnapshot: (
    hgRepo: string,
    gitRepo: string,
    options?: {
      defaultBranch?: string;
      branchesMap?: string;
      onProgress?: (detail: string) => void;
    },
  ) => {
    const { onProgress, ...rest } = options ?? {};
    const handler = (_: unknown, data: { detail: string }) =>
      onProgress?.(data.detail);
    if (onProgress) ipcRenderer.on("snapshot:progress", handler);
    return ipcRenderer
      .invoke("snapshot:get", { hgRepo, gitRepo, ...rest })
      .finally(() => {
        if (onProgress) ipcRenderer.removeListener("snapshot:progress", handler);
      });
  },

  getBranchHistory: (
    hgRepo: string,
    gitRepo: string,
    query: {
      hgBranch?: string;
      gitBranch?: string;
      limit?: number;
      offset?: number;
    },
  ) =>
    ipcRenderer.invoke("branch-history:get", {
      hgRepo,
      gitRepo,
      ...query,
    }),

  scanHgAuthors: (hgRepo: string) =>
    ipcRenderer.invoke("authors:scan", { hgRepo }),

  importAuthorsMap: (filePath: string) =>
    ipcRenderer.invoke("authors:import", { filePath }),

  validate: (body: unknown) => ipcRenderer.invoke("validate", body),

  fixGitIgnoreCase: (gitRepo: string) =>
    ipcRenderer.invoke("git:fix-ignore-case", { gitRepo }),

  resetGitTarget: (gitRepo: string) =>
    ipcRenderer.invoke("git:reset-target", { gitRepo }),

  pickPath: (options: {

    kind: "directory" | "file";

    title?: string;

    defaultPath?: string;

  }) => ipcRenderer.invoke("pick-path", options),

  convert: (

    body: Record<string, unknown>,

    onLog: (data: Record<string, unknown>) => void,

    onSnapshotProgress?: (detail: string) => void,

  ) => {

    const logHandler = (_: unknown, data: Record<string, unknown>) => onLog(data);

    ipcRenderer.on("convert:log", logHandler);

    const snapHandler = onSnapshotProgress
      ? (_: unknown, data: { detail: string }) => onSnapshotProgress(data.detail)
      : null;

    if (snapHandler) {
      ipcRenderer.on("convert:snapshot-progress", snapHandler);
    }

    return ipcRenderer.invoke("convert", body).finally(() => {

      ipcRenderer.removeListener("convert:log", logHandler);

      if (snapHandler) {
        ipcRenderer.removeListener("convert:snapshot-progress", snapHandler);
      }

    });

  },

  onAppCommand: (handler: (payload: { command: string; payload?: unknown }) => void) => {

    const listener = (_: unknown, data: { command: string; payload?: unknown }) =>

      handler(data);

    ipcRenderer.on("app:command", listener);

    return () => ipcRenderer.removeListener("app:command", listener);

  },

  onRequestExit: (handler: () => void) => {
    const listener = () => handler();
    ipcRenderer.on("app:request-exit", listener);
    return () => ipcRenderer.removeListener("app:request-exit", listener);
  },

  confirmQuit: () => ipcRenderer.invoke("app:confirm-quit"),

};



contextBridge.exposeInMainWorld("hgToGit", bridge);


