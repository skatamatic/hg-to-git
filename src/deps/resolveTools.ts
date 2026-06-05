import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { windowsToolPaths } from "./pathWindows.js";

export interface ResolvedTools {
  git: string | null;
  python: string | null;
  hg: string | null;
}

export interface PersistedTools {
  git?: string;
  python?: string;
  hg?: string;
  updatedAt?: string;
}

let cache: ResolvedTools | null = null;

function toolsConfigPath(): string {
  const base =
    process.env.HG_TO_GIT_UI_STATE != null
      ? path.dirname(process.env.HG_TO_GIT_UI_STATE)
      : path.join(
          process.env.LOCALAPPDATA ?? process.env.HOME ?? ".",
          "hg-to-git",
        );
  return path.join(base, "tool-paths.json");
}

function loadPersisted(): PersistedTools {
  const file = toolsConfigPath();
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8")) as PersistedTools;
  } catch {
    return {};
  }
}

function savePersisted(tools: ResolvedTools): void {
  const file = toolsConfigPath();
  mkdirSync(path.dirname(file), { recursive: true });
  const data: PersistedTools = {
    updatedAt: new Date().toISOString(),
  };
  if (tools.git) data.git = tools.git;
  if (tools.python) data.python = tools.python;
  if (tools.hg) data.hg = tools.hg;
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function readWindowsUserPath(): string {
  if (process.platform !== "win32") return "";
  const r = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')",
    ],
    { encoding: "utf8", windowsHide: true, timeout: 15_000 },
  );
  return r.status === 0 ? r.stdout.trim() : "";
}

/** Merge discovered tool dirs + registry PATH into the current process. */
export function applyToolPathsToProcess(tools?: ResolvedTools): void {
  const t = tools ?? getResolvedTools();
  const parts = new Set<string>();

  for (const exe of [t.git, t.python, t.hg]) {
    if (exe) parts.add(path.dirname(exe));
  }

  if (process.platform === "win32") {
    for (const dir of windowsToolPaths()) parts.add(dir);
    for (const dir of readWindowsUserPath().split(path.delimiter)) {
      if (dir.trim()) parts.add(dir.trim());
    }
  }

  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (dir.trim()) parts.add(dir.trim());
  }

  process.env.PATH = [...parts].join(path.delimiter);
}

function tryExecutable(
  exe: string,
  versionArgs: string[] = ["--version"],
): boolean {
  if (!existsSync(exe) && !exe.includes(path.sep)) return false;
  const r = spawnSync(exe, versionArgs, {
    encoding: "utf8",
    windowsHide: true,
    env: process.env,
    timeout: 30_000,
  });
  return r.status === 0;
}

function tryPythonMercurial(exe: string): boolean {
  const r = spawnSync(
    exe,
    ["-c", "from mercurial.scmutil import revsymbol; import mercurial"],
    { encoding: "utf8", windowsHide: true, env: process.env, timeout: 30_000 },
  );
  return r.status === 0;
}

function discoverGitExe(): string | null {
  const persisted = loadPersisted().git;
  if (persisted && existsSync(persisted) && tryExecutable(persisted)) {
    return persisted;
  }

  const names = process.platform === "win32" ? ["git.exe", "git"] : ["git"];
  const searchDirs = new Set<string>();

  for (const dir of windowsToolPaths()) searchDirs.add(dir);
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (dir.trim()) searchDirs.add(dir.trim());
  }
  for (const dir of readWindowsUserPath().split(path.delimiter)) {
    if (dir.trim()) searchDirs.add(dir.trim());
  }

  if (process.platform === "win32") {
    const pf = process.env.ProgramFiles ?? "C:\\Program Files";
    searchDirs.add(path.join(pf, "Git", "cmd"));
    searchDirs.add(path.join(pf, "Git", "bin"));
  }

  for (const dir of searchDirs) {
    for (const name of names) {
      const full = path.join(dir, name);
      if (existsSync(full) && tryExecutable(full)) return full;
    }
  }

  for (const name of names) {
    if (tryExecutable(name)) {
      const which = spawnSync(
        process.platform === "win32" ? "where" : "which",
        [name.replace(".exe", "")],
        { encoding: "utf8", windowsHide: true, env: process.env },
      );
      const first = (which.stdout ?? "").split(/\r?\n/)[0]?.trim();
      if (first && existsSync(first)) return first;
    }
  }

  return null;
}

function discoverPythonExe(): string | null {
  const persisted = loadPersisted().python;
  if (persisted && existsSync(persisted) && tryExecutable(persisted)) {
    return persisted;
  }

  const candidates: string[] = [];

  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA ?? "";
    const pyRoot = path.join(local, "Programs", "Python");
    if (existsSync(pyRoot)) {
      try {
        for (const entry of readdirSync(pyRoot, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          candidates.push(path.join(pyRoot, entry.name, "python.exe"));
        }
      } catch {
        /* */
      }
    }
    candidates.push("py", "python", "python3");
  } else {
    candidates.push("python3", "python");
  }

  for (const cmd of candidates) {
    if (cmd.includes(path.sep)) {
      if (existsSync(cmd) && tryExecutable(cmd)) return cmd;
      continue;
    }
    if (tryExecutable(cmd)) {
      if (process.platform === "win32" && cmd === "py") {
        const r = spawnSync("py", ["-0p"], {
          encoding: "utf8",
          windowsHide: true,
          env: process.env,
        });
        const line = (r.stdout ?? "").split(/\r?\n/).find((l) => l.includes("python.exe"));
        if (line) {
          const m = line.match(/([A-Za-z]:\\[^\s*]+python\.exe)/i);
          if (m?.[1] && existsSync(m[1])) return m[1];
        }
      }
      const which = spawnSync(
        process.platform === "win32" ? "where" : "which",
        [cmd],
        { encoding: "utf8", windowsHide: true, env: process.env },
      );
      const first = (which.stdout ?? "").split(/\r?\n/)[0]?.trim();
      if (first && existsSync(first)) return first;
      return cmd;
    }
  }

  return null;
}

function discoverHgExe(python: string | null): string | null {
  const persisted = loadPersisted().hg;
  if (persisted && existsSync(persisted) && tryExecutable(persisted)) {
    return persisted;
  }

  if (python) {
    const scripts = path.join(path.dirname(python), "Scripts");
    for (const name of process.platform === "win32" ? ["hg.exe", "hg"] : ["hg"]) {
      const full = path.join(scripts, name);
      if (existsSync(full) && tryExecutable(full)) return full;
    }
  }

  const names = process.platform === "win32" ? ["hg.exe", "hg"] : ["hg"];
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    for (const name of names) {
      const full = path.join(dir, name);
      if (existsSync(full) && tryExecutable(full)) return full;
    }
  }

  for (const name of names) {
    if (tryExecutable(name)) {
      const which = spawnSync(
        process.platform === "win32" ? "where" : "which",
        [name.replace(".exe", "")],
        { encoding: "utf8", windowsHide: true, env: process.env },
      );
      const first = (which.stdout ?? "").split(/\r?\n/)[0]?.trim();
      if (first && existsSync(first)) return first;
    }
  }

  return null;
}

export function discoverTools(): ResolvedTools {
  applyToolPathsToProcess({ git: null, python: null, hg: null });
  const python = discoverPythonExe();
  const tools: ResolvedTools = {
    git: discoverGitExe(),
    python,
    hg: discoverHgExe(python),
  };
  return tools;
}

/** Rescan, persist, and update process PATH (call after winget/pip installs). */
export function refreshResolvedTools(): ResolvedTools {
  cache = discoverTools();
  savePersisted(cache);
  applyToolPathsToProcess(cache);
  return cache;
}

export function getResolvedTools(): ResolvedTools {
  if (!cache) {
    cache = discoverTools();
    if (cache.git || cache.python || cache.hg) {
      savePersisted(cache);
      applyToolPathsToProcess(cache);
    }
  }
  return cache;
}

export function requireGit(): string {
  const git = getResolvedTools().git;
  if (!git) throw new Error("git is not installed or not on PATH");
  return git;
}

export function requireHg(): string {
  const hg = getResolvedTools().hg;
  if (!hg) throw new Error("hg (Mercurial) is not installed or not on PATH");
  return hg;
}

export function requirePython(preferred?: string): string {
  if (preferred) {
    if (tryExecutable(preferred) && tryPythonMercurial(preferred)) return preferred;
    throw new Error(`Python at ${preferred} is not usable (need mercurial module)`);
  }
  refreshResolvedTools();
  const py = getResolvedTools().python;
  if (!py || !tryPythonMercurial(py)) {
    throw new Error(
      "Python 3.7+ with the mercurial package is required. Install: pip install mercurial",
    );
  }
  return py;
}

export function spawnWithResolved(
  tool: "git" | "hg" | "python",
  args: string[],
  options: Parameters<typeof spawnSync>[2] = {},
) {
  const exe =
    tool === "git"
      ? requireGit()
      : tool === "hg"
        ? requireHg()
        : requirePython();
  return spawnSync(exe, args, {
    encoding: "utf8",
    windowsHide: true,
    ...options,
    env: { ...process.env, ...options.env },
  });
}
