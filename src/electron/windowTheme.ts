import type { BrowserWindow } from "electron";

export type AppTheme = "light" | "dark";

/** Match web/src/index.css workbench tokens */
export const THEME_CHROME: Record<
  AppTheme,
  { background: string; titleBar: string; symbol: string }
> = {
  light: {
    background: "#f8fafc",
    titleBar: "#ffffff",
    symbol: "#0f172a",
  },
  dark: {
    background: "#1e1e24",
    titleBar: "#25252e",
    symbol: "#e8e8ed",
  },
};

export function applyWindowTheme(
  win: BrowserWindow | null,
  theme: AppTheme,
): void {
  if (!win || win.isDestroyed()) return;

  const colors = THEME_CHROME[theme];
  win.setBackgroundColor(colors.background);

  if (process.platform === "win32") {
    try {
      win.setTitleBarOverlay({
        color: colors.titleBar,
        symbolColor: colors.symbol,
        height: 32,
      });
    } catch {
      /* titleBarOverlay requires Windows 11+ */
    }
  }
}

export function themeFromStorageValue(
  value: string | null | undefined,
): AppTheme {
  if (value === "light" || value === "dark") return value;
  return "dark";
}
