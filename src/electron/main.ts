import { app, BrowserWindow, dialog, ipcMain, nativeTheme } from "electron";

import path from "node:path";

import { fileURLToPath } from "node:url";

import {

  apiCheckToolchain,

  apiConvert,

  type ConvertLogHandler,

  apiCreateProject,

  apiInstallToolchain,

  apiDeleteProject,

  apiGetProjectsState,

  apiGetSnapshot,
  apiGetBranchHistory,

  apiOpenProject,

  apiSaveProject,

  apiValidate,
  apiFixGitIgnoreCase,
  apiGetHgAuthors,
  apiImportAuthorsMap,
  apiResetGitTarget,

  syncLegacySettingsFromProject,

} from "../backend.js";

import { refreshResolvedTools } from "../deps/resolveTools.js";
import { setApplicationMenu, type MenuSyncState } from "./menu.js";
import {
  applyWindowTheme,
  themeFromStorageValue,
  THEME_CHROME,
  type AppTheme,
} from "./windowTheme.js";



const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Load web/dist (production UI) instead of the Vite dev server. */
const useBuiltUi =
  app.isPackaged || process.env.HG_TO_GIT_USE_BUILT_UI === "1";
const isDev =
  !useBuiltUi &&
  (process.env.NODE_ENV === "development" || !app.isPackaged);



let mainWindow: BrowserWindow | null = null;
let quitConfirmed = false;



function attachWindowThemeSync(win: BrowserWindow) {
  const syncFromPage = async () => {
    if (win.isDestroyed()) return;
    try {
      const stored = await win.webContents.executeJavaScript(
        `localStorage.getItem("hg-to-git-theme")`,
        true,
      );
      const theme = themeFromStorageValue(stored as string | null);
      applyWindowTheme(win, theme);
    } catch {
      applyWindowTheme(win, "dark");
    }
  };

  win.webContents.on("did-finish-load", () => void syncFromPage());
  win.webContents.on("did-navigate-in-page", () => void syncFromPage());
}

function createWindow() {
  const initialTheme: AppTheme = nativeTheme.shouldUseDarkColors
    ? "dark"
    : "light";
  const initialChrome = THEME_CHROME[initialTheme];

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    title: "hg-to-git",
    backgroundColor: initialChrome.background,
    autoHideMenuBar: process.platform === "win32",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  attachWindowThemeSync(mainWindow);

  if (isDev) {

    const devUrl = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";

    mainWindow.loadURL(devUrl);

    if (process.env.HG_TO_GIT_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }

  } else {

    mainWindow.loadFile(path.join(__dirname, "../../web/dist/index.html"));

  }



  mainWindow.on("close", (e) => {
    if (quitConfirmed) return;
    e.preventDefault();
    mainWindow?.webContents.send("app:request-exit");
  });

  mainWindow.on("closed", () => {

    mainWindow = null;

  });

}



async function pickPathNative(options: {
  kind: "directory" | "file";
  title?: string;
  defaultPath?: string;
}) {
  const win = mainWindow;
  if (!win || win.isDestroyed()) {
    return { path: null, cancelled: true };
  }

  win.focus();
  win.setEnabled(false);

  try {
    const result = await dialog.showOpenDialog(win, {
      title: options.title ?? "Select path",
      defaultPath: options.defaultPath,
      properties:
        options.kind === "directory" ? ["openDirectory"] : ["openFile"],
      filters:
        options.kind === "file"
          ? [
              { name: "Author maps", extensions: ["map"] },
              { name: "All files", extensions: ["*"] },
            ]
          : undefined,
    });

    if (result.canceled || !result.filePaths[0]) {
      return { path: null, cancelled: true };
    }
    return { path: result.filePaths[0], cancelled: false };
  } finally {
    if (!win.isDestroyed()) {
      win.setEnabled(true);
      win.focus();
    }
  }
}



function registerIpc() {

  ipcMain.handle("projects:get", () => apiGetProjectsState());

  ipcMain.handle("projects:create", async (_e, input) => {
    const result = await apiCreateProject(input);
    await syncLegacySettingsFromProject(result.project);
    return result;
  });

  ipcMain.handle("projects:open", async (_e, id: string) => {

    const state = await apiOpenProject(id);

    const project = state.projects.find((p) => p.id === id);

    if (project) await syncLegacySettingsFromProject(project);

    return state;

  });

  ipcMain.handle("projects:save", async (_e, { id, partial }) => {

    const result = await apiSaveProject(id, partial);

    await syncLegacySettingsFromProject(result.project);

    return result;

  });

  ipcMain.handle("projects:delete", (_e, id: string) => apiDeleteProject(id));



  ipcMain.handle("menu:sync", (_e, state: MenuSyncState) => {

    setApplicationMenu(mainWindow, state);

    if (mainWindow && state.activeProjectId) {

      const project = state.projects.find((p) => p.id === state.activeProjectId);

      if (project?.name) mainWindow.setTitle(`${project.name} — hg-to-git`);

    } else if (mainWindow) {

      mainWindow.setTitle("hg-to-git");

    }

  });



  ipcMain.handle("authors:scan", (_e, { hgRepo }: { hgRepo: string }) => {
    try {
      return apiGetHgAuthors(hgRepo);
    } catch (e) {
      return Promise.reject(e);
    }
  });

  ipcMain.handle(
    "authors:import",
    (_e, { filePath }: { filePath: string }) => {
      try {
        return apiImportAuthorsMap(filePath);
      } catch (e) {
        return Promise.reject(e);
      }
    },
  );

  ipcMain.handle(
    "snapshot:get",
    async (
      event,
      {
        hgRepo,
        gitRepo,
        defaultBranch,
        branchesMap,
      }: {
        hgRepo: string;
        gitRepo: string;
        defaultBranch?: string;
        branchesMap?: string;
      },
    ) =>
      apiGetSnapshot(
        hgRepo,
        gitRepo,
        { defaultBranch, branchesMap },
        (detail) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send("snapshot:progress", { detail });
          }
        },
      ),
  );

  ipcMain.handle(
    "branch-history:get",
    (
      _e,
      {
        hgRepo,
        gitRepo,
        hgBranch,
        gitBranch,
        defaultBranch,
        limit,
        offset,
      }: {
        hgRepo: string;
        gitRepo: string;
        hgBranch?: string;
        gitBranch?: string;
        defaultBranch?: string;
        limit?: number;
        offset?: number;
      },
    ) =>
      apiGetBranchHistory(hgRepo, gitRepo, {
        hgBranch,
        gitBranch,
        defaultBranch,
        limit,
        offset,
      }),
  );

  ipcMain.handle("validate", async (_e, body) => {

    try {

      return await apiValidate(body);

    } catch (e) {

      return { ok: false, error: String(e) };

    }

  });

  ipcMain.handle("git:fix-ignore-case", (_e, { gitRepo }: { gitRepo: string }) => {
    try {
      return apiFixGitIgnoreCase(gitRepo);
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle("git:reset-target", (_e, { gitRepo }: { gitRepo: string }) => {
    try {
      return apiResetGitTarget(gitRepo);
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle("app:confirm-quit", () => {
    quitConfirmed = true;
    app.quit();
    return { ok: true };
  });

  ipcMain.handle("window:sync-theme", (_e, theme: string) => {
    const t = themeFromStorageValue(theme) as AppTheme;
    applyWindowTheme(mainWindow, t);
    return { ok: true };
  });

  ipcMain.handle("pick-path", (_e, options) => pickPathNative(options));

  ipcMain.handle("deps:check", () => apiCheckToolchain());

  ipcMain.handle("deps:install", async (event, toolIds: string[]) => {
    return apiInstallToolchain(toolIds as import("../deps/toolchain.js").ToolId[], (message) => {
      event.sender.send("deps:log", { message });
    });
  });

  ipcMain.handle("convert", async (event, body) => {
    try {
      const emitLog: ConvertLogHandler = (log) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("convert:log", log);
        }
      };

      const { result, snapshot } = await apiConvert(
        body,
        emitLog,
        (detail) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send("convert:snapshot-progress", { detail });
          }
        },
      );
      return { ok: true, result, snapshot };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

}



app.whenReady().then(async () => {

  refreshResolvedTools();

  registerIpc();

  createWindow();

  const state = await apiGetProjectsState();

  setApplicationMenu(mainWindow, {

    projects: state.projects,

    activeProjectId: state.lastProjectId,

  });



  app.on("activate", () => {

    if (BrowserWindow.getAllWindows().length === 0) createWindow();

  });

});



app.on("window-all-closed", () => {

  if (process.platform !== "darwin") app.quit();

});


