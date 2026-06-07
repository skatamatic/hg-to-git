import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
} from "electron";
import {
  getRecentProjects,
  type Project,
} from "../server/projects.js";

export type AppCommand =
  | "file:new-project"
  | "file:open-project"
  | "file:load-project"
  | "file:save-project"
  | "file:save-project-as"
  | "file:exit"
  | "view:setup"
  | "view:results"
  | "view:toggle-output"
  | "view:toggle-theme"
  | "view:theme-light"
  | "view:theme-dark"
  | "view:toggle-simple-mode"
  | "run:convert";

export interface MenuSyncState {
  projects: Project[];
  recentProjectIds?: string[];
  activeProjectId: string | null;
  simpleMode?: boolean;
  projectConfigured?: boolean;
  menuRestricted?: boolean;
}

function sendCommand(win: BrowserWindow | null, command: AppCommand, payload?: unknown) {
  const target = win ?? BrowserWindow.getAllWindows()[0];
  target?.webContents.send("app:command", { command, payload });
}

export function buildAppMenu(
  win: BrowserWindow | null,
  state: MenuSyncState,
): Menu {
  const isMac = process.platform === "darwin";
  const recentProjects = getRecentProjects({
    version: 1,
    lastProjectId: state.activeProjectId,
    projects: state.projects,
    recentProjectIds: state.recentProjectIds,
  });
  const restricted = Boolean(state.menuRestricted);

  const recentSubmenu: MenuItemConstructorOptions[] =
    recentProjects.length === 0
      ? [{ label: "No recent projects", enabled: false }]
      : recentProjects.map((p) => ({
          label: p.name,
          type: "radio" as const,
          checked: p.id === state.activeProjectId,
          enabled: !restricted,
          click: () =>
            sendCommand(win, "file:open-project", { projectId: p.id }),
        }));

  const fileSubmenu: MenuItemConstructorOptions[] = [
    {
      label: "New Project",
      accelerator: "CmdOrCtrl+N",
      enabled: !restricted,
      click: () => sendCommand(win, "file:new-project"),
    },
    { type: "separator" },
    {
      label: "Recent",
      submenu: recentSubmenu,
      enabled: !restricted,
    },
    {
      label: "Load Project…",
      enabled: !restricted,
      click: () => sendCommand(win, "file:load-project"),
    },
    { type: "separator" },
    {
      label: "Save Project",
      accelerator: "CmdOrCtrl+S",
      enabled: !restricted && Boolean(state.activeProjectId),
      click: () => sendCommand(win, "file:save-project"),
    },
    {
      label: "Save Project As…",
      enabled: !restricted && Boolean(state.activeProjectId),
      click: () => sendCommand(win, "file:save-project-as"),
    },
    { type: "separator" },
    {
      label: "Exit",
      accelerator: isMac ? "Cmd+Q" : "Alt+F4",
      click: () => sendCommand(win, "file:exit"),
    },
  ];

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              {
                label: "Quit hg-to-git",
                accelerator: "Cmd+Q",
                click: () => sendCommand(win, "file:exit"),
              },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
    {
      label: "File",
      submenu: isMac
        ? [
            ...fileSubmenu.slice(0, -2),
            { type: "separator" },
            { role: "close" },
            { type: "separator" },
            fileSubmenu[fileSubmenu.length - 1]!,
          ]
        : fileSubmenu,
    },
    {
      label: "View",
      submenu: [
        {
          label: "Simple Mode",
          type: "checkbox",
          checked: Boolean(state.simpleMode),
          enabled: !restricted && Boolean(state.projectConfigured),
          click: () => sendCommand(win, "view:toggle-simple-mode"),
        },
        { type: "separator" },
        {
          label: "Setup",
          accelerator: "CmdOrCtrl+1",
          enabled: !restricted,
          click: () => sendCommand(win, "view:setup"),
        },
        {
          label: "Run",
          accelerator: "CmdOrCtrl+2",
          enabled: !restricted,
          click: () => sendCommand(win, "view:results"),
        },
        { type: "separator" },
        {
          label: "Toggle Output",
          accelerator: "CmdOrCtrl+`",
          enabled: !restricted,
          click: () => sendCommand(win, "view:toggle-output"),
        },
        { type: "separator" },
        {
          label: "Toggle Theme",
          enabled: !restricted,
          click: () => sendCommand(win, "view:toggle-theme"),
        },
        { type: "separator" },
        { role: "toggleDevTools" },
        { role: "reload" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About hg-to-git",
          click: () => {
            const target = win ?? BrowserWindow.getFocusedWindow();
            if (!target) return;
            void dialog.showMessageBox(target, {
              type: "info",
              title: "About hg-to-git",
              message: "hg-to-git",
              detail:
                "Convert Mercurial repositories to Git with incremental sync.\n\nRequires git, hg, and Python with mercurial on PATH.",
            });
          },
        },
      ],
    },
  ];

  if (isMac) {
    template.push({
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  return menu;
}

let lastMenuState: MenuSyncState = { projects: [], activeProjectId: null };

export function setApplicationMenu(
  win: BrowserWindow | null,
  state: MenuSyncState,
) {
  lastMenuState = state;
  // Windows/Linux use the themed in-window menu; native menu bar clashes with title overlay.
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
    return;
  }
  const menu = buildAppMenu(win, state);
  Menu.setApplicationMenu(menu);
}

export function refreshMenuFromState(win: BrowserWindow | null) {
  setApplicationMenu(win, lastMenuState);
}
