import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export interface UiSettings {
  hgRepo: string;
  gitRepo: string;
  defaultBranch?: string;
  checkoutWorkingTree?: boolean;
  simpleMode?: boolean;
  lastRunAt?: string;
  lastRunStatus?: "success" | "error" | "idle";
}

function settingsPath(): string {
  const base =
    process.env.HG_TO_GIT_UI_STATE ??
    path.join(
      process.env.LOCALAPPDATA ?? process.env.HOME ?? ".",
      "hg-to-git",
      "ui-settings.json",
    );
  return base;
}

const DEFAULTS: UiSettings = {
  hgRepo: "",
  gitRepo: "",
  defaultBranch: "master",
};

export async function loadUiSettings(): Promise<UiSettings> {
  const file = settingsPath();
  if (!existsSync(file)) return { ...DEFAULTS };
  try {
    const raw = await readFile(file, "utf8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveUiSettings(
  partial: Partial<UiSettings>,
): Promise<UiSettings> {
  const current = await loadUiSettings();
  const next = { ...current, ...partial };
  const file = settingsPath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}
