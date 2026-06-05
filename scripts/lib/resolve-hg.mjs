import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

function tryHgExe(exe) {
  if (!exe) return null;
  const r = spawnSync(exe, ["--version"], {
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  });
  return r.status === 0 ? exe : null;
}

function readPersistedHg() {
  const base = path.join(
    process.env.LOCALAPPDATA ?? process.env.HOME ?? "",
    "hg-to-git",
    "tool-paths.json",
  );
  if (!existsSync(base)) return null;
  try {
    const data = JSON.parse(readFileSync(base, "utf8"));
    if (data.hg && existsSync(data.hg)) return tryHgExe(data.hg);
  } catch {
    /* */
  }
  return null;
}

function windowsSearchDirs() {
  const dirs = [];
  const local = process.env.LOCALAPPDATA ?? "";
  const pf = process.env.ProgramFiles ?? "C:\\Program Files";
  const pyRoot = path.join(local, "Programs", "Python");
  if (existsSync(pyRoot)) {
    for (const entry of readdirSync(pyRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      dirs.push(path.join(pyRoot, entry.name, "Scripts"));
    }
  }
  dirs.push(path.join(pf, "Mercurial"), path.join(local, "Programs", "Mercurial"));
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (dir.trim()) dirs.push(dir.trim());
  }
  return dirs;
}

function findHgOnDisk() {
  const names = process.platform === "win32" ? ["hg.exe", "hg"] : ["hg"];
  for (const dir of windowsSearchDirs()) {
    for (const name of names) {
      const full = path.join(dir, name);
      const ok = tryHgExe(existsSync(full) ? full : null);
      if (ok) return ok;
    }
  }
  if (process.platform === "win32") {
    const r = spawnSync(
      "where.exe",
      ["hg"],
      { encoding: "utf8", windowsHide: true, shell: false },
    );
    const first = (r.stdout ?? "").split(/\r?\n/)[0]?.trim();
    const ok = tryHgExe(first);
    if (ok) return ok;
  }
  return tryHgExe("hg");
}

/** Resolve hg executable (persisted app paths, dist helper, or filesystem search). */
export async function resolveHgExecutable() {
  if (process.env.HG_TO_GIT_HG) {
    const ok = tryHgExe(process.env.HG_TO_GIT_HG);
    if (ok) return ok;
  }

  const persisted = readPersistedHg();
  if (persisted) return persisted;

  const distTools = path.join(root, "dist", "deps", "resolveTools.js");
  if (existsSync(distTools)) {
    try {
      const mod = await import(
        new URL(`file:///${distTools.replace(/\\/g, "/")}`).href
      );
      mod.refreshResolvedTools();
      const hg = mod.getResolvedTools().hg;
      const ok = tryHgExe(hg);
      if (ok) return ok;
    } catch {
      /* fall through */
    }
  }

  return findHgOnDisk();
}

export function isHgRepository(dir) {
  return existsSync(path.join(dir, ".hg"));
}
