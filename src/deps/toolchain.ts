import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { getResolvedTools, refreshResolvedTools } from "./resolveTools.js";

export type ToolId = "git" | "hg" | "python" | "mercurial";

export interface ToolCheck {
  id: ToolId;
  name: string;
  description: string;
  installed: boolean;
  version?: string;
  detail?: string;
  canAutoInstall: boolean;
}

export interface ToolchainReport {
  ok: boolean;
  platform: string;
  canAutoInstall: boolean;
  installerNote?: string;
  tools: ToolCheck[];
}

function spawnEnv(cmd: string, args: string[], env?: NodeJS.ProcessEnv) {
  return spawnSync(cmd, args, {
    encoding: "utf8",
    windowsHide: true,
    env: env ?? process.env,
    timeout: 120_000,
  });
}

function runExe(
  exe: string | null,
  args: string[],
): { ok: boolean; out: string } {
  if (!exe) return { ok: false, out: "" };
  const r = spawnEnv(exe, args, process.env);
  const out = ((r.stdout ?? "") + (r.stderr ?? "")).trim();
  return { ok: r.status === 0, out };
}

function findPythonCmd(): { cmd: string; ok: boolean; version?: string } | null {
  const py = getResolvedTools().python;
  if (!py) return null;
  const ver = runExe(py, ["--version"]);
  if (ver.ok) return { cmd: py, ok: true, version: ver.out.split("\n")[0] };
  return null;
}

function checkMercurialModule(pyCmd: string): { ok: boolean; version?: string } {
  const r = runExe(pyCmd, [
    "-c",
    "import mercurial; print(getattr(mercurial, '__version__', 'unknown'))",
  ]);
  if (!r.ok) return { ok: false };
  return { ok: true, version: r.out.split("\n")[0] };
}

function wingetAvailable(): boolean {
  if (process.platform !== "win32") return false;
  const r = spawnEnv("winget", ["--version"], process.env);
  return r.status === 0;
}

export function checkToolchain(): ToolchainReport {
  refreshResolvedTools();
  const resolved = getResolvedTools();
  const canAutoInstall = process.platform === "win32" && wingetAvailable();
  const installerNote = canAutoInstall
    ? "Missing tools can be installed automatically with winget. PATH is refreshed after install — no restart needed."
    : process.platform === "win32"
      ? "Install Git, Python 3, and Mercurial manually, then click Re-check."
      : "Install git, hg, and Python 3 with pip install mercurial.";

  const gitR = runExe(resolved.git, ["--version"]);
  const hgR = runExe(resolved.hg, ["--version"]);
  const py = findPythonCmd();
  const mercurial =
    py != null ? checkMercurialModule(py.cmd) : { ok: false as const };

  const tools: ToolCheck[] = [
    {
      id: "git",
      name: "Git",
      description: "Creates and imports into the target Git repository.",
      installed: gitR.ok,
      version: gitR.ok ? gitR.out.split("\n")[0] : undefined,
      detail: gitR.ok ? undefined : "Not found on PATH",
      canAutoInstall,
    },
    {
      id: "python",
      name: "Python 3",
      description: "Runs hg-fast-export during conversion.",
      installed: py != null,
      version: py?.version,
      detail: py == null ? "Python 3 not found" : undefined,
      canAutoInstall,
    },
    {
      id: "mercurial",
      name: "Mercurial (Python)",
      description: "Python package required by hg-fast-export.",
      installed: mercurial.ok,
      version: mercurial.version,
      detail: mercurial.ok
        ? undefined
        : py != null
          ? "Run: pip install mercurial"
          : "Install Python first",
      canAutoInstall,
    },
    {
      id: "hg",
      name: "hg command",
      description: "Reads your Mercurial repository.",
      installed: hgR.ok,
      version: hgR.ok ? hgR.out.split("\n")[0] : undefined,
      detail: hgR.ok
        ? undefined
        : mercurial.ok
          ? "Install mercurial via pip (includes hg)"
          : "Requires Python + mercurial",
      canAutoInstall: canAutoInstall,
    },
  ];

  const ok = tools.every((t) => t.installed);
  return {
    ok,
    platform: process.platform,
    canAutoInstall,
    installerNote,
    tools,
  };
}

function runWinget(wingetId: string, label: string, log: (msg: string) => void): boolean {
  log(`Installing ${label} (${wingetId})…`);
  const r = spawnSync(
    "winget",
    [
      "install",
      "--id",
      wingetId,
      "-e",
      "--accept-package-agreements",
      "--accept-source-agreements",
    ],
    {
      encoding: "utf8",
      windowsHide: false,
      env: process.env,
      timeout: 600_000,
    },
  );
  const out = ((r.stdout ?? "") + (r.stderr ?? "")).trim();
  if (out) log(out.slice(-2000));
  if (r.status === 0 || r.status === 2316632107) {
    // 2316632107 = already installed
    log(`${label} ready.`);
    return true;
  }
  log(`${label} install finished with code ${r.status ?? "unknown"}.`);
  return r.status === 0;
}

function runPipMercurial(log: (msg: string) => void): boolean {
  refreshResolvedTools();
  const py = findPythonCmd();
  if (!py) {
    log("Python not found — cannot install Mercurial.");
    return false;
  }
  log("Installing Mercurial via pip…");
  const r = spawnSync(py.cmd, ["-m", "pip", "install", "mercurial"], {
    encoding: "utf8",
    windowsHide: false,
    env: process.env,
    timeout: 300_000,
  });
  const out = ((r.stdout ?? "") + (r.stderr ?? "")).trim();
  if (out) log(out.slice(-1500));
  if (r.status === 0) {
    log("Mercurial installed.");
    return true;
  }
  log(`pip install failed (code ${r.status ?? "unknown"}).`);
  return false;
}

const WINGET_PACKAGES: Partial<Record<ToolId, { id: string; label: string }>> = {
  git: { id: "Git.Git", label: "Git" },
  python: { id: "Python.Python.3.12", label: "Python 3.12" },
};

export async function installTools(
  toolIds: ToolId[],
  onLog?: (message: string) => void,
): Promise<{ ok: boolean; report: ToolchainReport; logs: string[] }> {
  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(msg);
    onLog?.(msg);
  };

  if (process.platform !== "win32") {
    log("Automatic install is only supported on Windows (winget).");
    log("Install git, Python 3, and run: pip install mercurial");
    return { ok: false, report: checkToolchain(), logs };
  }

  if (!wingetAvailable()) {
    log("winget is not available. Install App Installer from the Microsoft Store.");
    return { ok: false, report: checkToolchain(), logs };
  }

  const order: ToolId[] = ["git", "python", "mercurial", "hg"];
  const wanted = new Set(toolIds);

  for (const id of order) {
    if (!wanted.has(id)) continue;
    const report = checkToolchain();
    const tool = report.tools.find((t) => t.id === id);
    if (tool?.installed) {
      log(`${tool.name} already installed.`);
      continue;
    }

    if (id === "mercurial" || id === "hg") {
      if (!report.tools.find((t) => t.id === "python")?.installed) {
        const pyPkg = WINGET_PACKAGES.python;
        if (pyPkg) runWinget(pyPkg.id, pyPkg.label, log);
      }
      runPipMercurial(log);
      continue;
    }

    const pkg = WINGET_PACKAGES[id];
    if (pkg) runWinget(pkg.id, pkg.label, log);
    refreshResolvedTools();
  }

  refreshResolvedTools();
  const report = checkToolchain();
  return { ok: report.ok, report, logs };
}

/** Open official download pages when winget is unavailable. */
export function getManualInstallUrls(): Record<ToolId, string> {
  return {
    git: "https://git-scm.com/download/win",
    hg: "https://www.mercurial-scm.org/wiki/downloads",
    python: "https://www.python.org/downloads/",
    mercurial: "https://www.mercurial-scm.org/wiki/PythonImplementation",
  };
}

export function hgExecutableCandidates(): string[] {
  refreshResolvedTools();
  const hg = getResolvedTools().hg;
  return hg && existsSync(hg) ? [hg] : [];
}
