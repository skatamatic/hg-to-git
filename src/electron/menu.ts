import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
} from "electron";
import type { Project } from "../server/projects.js";

export type AppCommand =
  | "file:new-project"
  | "file:open-project"
  | "file:save-project"
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
  activeProjectId: string | null;
  simpleMode?: boolean;
  projectConfigured?: boolean;
  menuRestricted?: boolean;
}

function sendCommand(win: BrowserWindow | null, command: AppCommand, payload?: unknown) {
  const target = win ?? BrowserWindow.getAllWindows()[0];
  target?.webContents.send("app:command", { command, payload });
}

function sortedProjects(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function buildAppMenu(
  win: BrowserWindow | null,
  state: MenuSyncState,
): Menu {
  const isMac = process.platform === "darwin";
  const projectList = sortedProjects(state.projects);
  const restricted = Boolean(state.menuRestricted);

  const fileSubmenu: MenuItemConstructorOptions[] = [
    {
      label: "New Project",
      accelerator: "CmdOrCtrl+N",
      enabled: !restricted,
      click: () => sendCommand(win, "file:new-project"),
    },
    ...(projectList.length === 0
      ? [{ label: "No projects", enabled: false }]
      : projectList.map((p) => ({
          label: p.name,
          type: "radio" as const,
          checked: p.id === state.activeProjectId,
          enabled: !restricted,
          click: () =>
            sendCommand(win, "file:open-project", { projectId: p.id }),
        }))),
    { type: "separator" },
    {
      label: "Save Project",
      accelerator: "CmdOrCtrl+S",
      enabled: !restricted,
      click: () => sendCommand(win, "file:save-project"),
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
