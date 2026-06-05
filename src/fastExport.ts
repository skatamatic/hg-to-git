import { spawn, spawnSync } from "node:child_process";
import * as readline from "node:readline";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { HgToGitConfig } from "./config.js";
import { findPython } from "./prerequisites.js";
import { requireGit } from "./deps/resolveTools.js";

const FAST_EXPORT_REPO = "https://github.com/frej/fast-export.git";
const STATE_PREFIX = "hg2git";

export interface ConvertResult {
  incremental: boolean;
  revisionsImported: number;
  gitDir: string;
  stateFiles: string[];
}

function repoRoot(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

function launcherScriptPath(): string {
  const nextToBundle = path.join(repoRoot(), "hgFastExportLauncher.py");
  if (existsSync(nextToBundle)) return nextToBundle;
  const inSrc = path.join(repoRoot(), "..", "src", "hgFastExportLauncher.py");
  if (existsSync(inSrc)) return inSrc;
  throw new Error(
    "hgFastExportLauncher.py not found (run npm run build to copy it into dist/)",
  );
}

export function defaultFastExportDir(): string {
  const env = process.env.HG_TO_GIT_FAST_EXPORT;
  if (env) return path.resolve(env);
  const local = path.resolve(repoRoot(), "..", "vendor", "fast-export");
  if (existsSync(path.join(local, "hg-fast-export.py"))) return local;
  const cache = path.join(
    process.env.LOCALAPPDATA ?? process.env.HOME ?? "",
    "hg-to-git",
    "fast-export",
  );
  return cache;
}

export function ensureFastExport(explicit?: string): string {
  const dir = explicit ? path.resolve(explicit) : defaultFastExportDir();
  const script = path.join(dir, "hg-fast-export.py");
  if (existsSync(script)) return dir;

  mkdirSync(path.dirname(dir), { recursive: true });
  const clone = spawnSync(
    requireGit(),
    ["clone", "--depth", "1", FAST_EXPORT_REPO, dir],
    { encoding: "utf8", windowsHide: true, env: process.env },
  );
  if (clone.status !== 0 || !existsSync(script)) {
    throw new Error(
      `Could not obtain fast-export at ${dir}. Clone manually:\n` +
        `  git clone ${FAST_EXPORT_REPO} "${dir}"`,
    );
  }
  return dir;
}

function gitDir(gitRepo: string): string {
  const r = spawnSync(requireGit(), ["-C", gitRepo, "rev-parse", "--git-dir"], {
    encoding: "utf8",
    windowsHide: true,
    env: process.env,
  });
  if (r.status !== 0) throw new Error(`git rev-parse failed: ${r.stderr}`);
  const rel = r.stdout.trim();
  return path.isAbsolute(rel) ? rel : path.join(gitRepo, rel);
}

function backupStateFiles(gitDirPath: string): void {
  for (const suffix of ["state", "marks", "mapping", "heads"]) {
    const f = path.join(gitDirPath, `${STATE_PREFIX}-${suffix}`);
    if (existsSync(f)) copyFileSync(f, `${f}~`);
  }
}

export function readImportedTip(gitDirPath: string): number {
  const state = path.join(gitDirPath, `${STATE_PREFIX}-state`);
  if (!existsSync(state)) return 0;
  for (const line of readFileSync(state, "utf8").split(/\r?\n/)) {
    const m = line.match(/^:tip\s+(\d+)/);
    if (m) return parseInt(m[1], 10);
  }
  return 0;
}

function mergeMarks(gitDirPath: string): void {
  const marks = path.join(gitDirPath, `${STATE_PREFIX}-marks`);
  const tmp = `${marks}.tmp`;
  const old = `${marks}.old`;
  if (existsSync(marks)) {
    copyFileSync(marks, old);
  } else {
    writeFileSync(old, "");
  }
  const oldContent = readFileSync(old, "utf8");
  const tmpContent = existsSync(tmp) ? readFileSync(tmp, "utf8") : "";
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const line of (oldContent + tmpContent).split(/\r?\n/)) {
    if (!line || seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  writeFileSync(marks, lines.join("\n") + (lines.length ? "\n" : ""));
}

function writeHeadsCache(gitRepo: string, gitDirPath: string): void {
  const git = requireGit();
  const branches = spawnSync(
    git,
    [
      "-C",
      gitRepo,
      "for-each-ref",
      "--format=%(refname:short)\t%(objectname)",
      "refs/heads/",
    ],
    { encoding: "utf8", windowsHide: true, env: process.env },
  );
  const lines: string[] = [];
  for (const line of (branches.stdout ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [head, sha] = line.split("\t");
    if (head && sha) lines.push(`:${head} ${sha.trim()}`);
  }
  writeFileSync(
    path.join(gitDirPath, `${STATE_PREFIX}-heads`),
    lines.join("\n") + (lines.length ? "\n" : ""),
  );
}

function buildExportArgs(
  config: HgToGitConfig,
  fastExportDir: string,
  gitDirPath: string,
): string[] {
  const args = [
    "--repo",
    config.hgRepo,
    "--marks",
    path.join(gitDirPath, `${STATE_PREFIX}-marks`),
    "--mapping",
    path.join(gitDirPath, `${STATE_PREFIX}-mapping`),
    "--heads",
    path.join(gitDirPath, `${STATE_PREFIX}-heads`),
    "--status",
    path.join(gitDirPath, `${STATE_PREFIX}-state`),
  ];
  if (config.authorsMap) args.push("-A", config.authorsMap);
  if (config.branchesMap) args.push("-B", config.branchesMap);
  if (config.tagsMap) args.push("-T", config.tagsMap);
  if (config.defaultBranch) args.push("-M", config.defaultBranch);
  if (config.encoding) args.push("-e", config.encoding);
  if (config.fileEncoding) args.push("--fe", config.fileEncoding);
  if (config.signedOffBy) args.push("-s");
  if (config.hgTags) args.push("--hgtags");
  if (config.ignoreUnnamedHeads) args.push("--ignore-unnamed-heads");
  if (config.force) args.push("--force");
  if (config.maxRevision != null) args.push("-m", String(config.maxRevision));
  if (config.sanitizeNames === false) args.push("-n");
  return args;
}

export interface ConvertStreamHandlers {
  onLine?: (stream: "hg-export" | "git-import", line: string) => void;
}

function attachStderrLines(
  stream: NodeJS.ReadableStream,
  label: "hg-export" | "git-import",
  onLine?: (stream: "hg-export" | "git-import", line: string) => void,
): void {
  if (!onLine) return;
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  rl.on("line", (line) => onLine(label, line));
}

function buildPythonArgs(
  config: HgToGitConfig,
  fastExportDir: string,
  gitDirPath: string,
): string[] {
  const exportScript = path.join(fastExportDir, "hg-fast-export.py");
  return [
    launcherScriptPath(),
    exportScript,
    ...buildExportArgs(config, fastExportDir, gitDirPath),
  ];
}

function runPipe(
  python: string,
  pyArgs: string[],
  gitRepo: string,
  gitDirPath: string,
  fastExportDir: string,
  quiet?: boolean,
  force?: boolean,
  handlers?: ConvertStreamHandlers,
): Promise<void> {
  const marksTmp = path.join(gitDirPath, `${STATE_PREFIX}-marks.tmp`);
  const gfiArgs = ["-C", gitRepo, "fast-import", `--export-marks=${marksTmp}`];
  if (quiet) gfiArgs.push("--quiet");
  if (force) gfiArgs.push("--force");

  const pathSep = process.platform === "win32" ? ";" : ":";
  const pythonPath = [fastExportDir, process.env.PYTHONPATH]
    .filter(Boolean)
    .join(pathSep);

  return new Promise((resolve, reject) => {
    const py = spawn(python, ["-u", ...pyArgs], {
      cwd: fastExportDir,
      env: {
        ...process.env,
        GIT_DIR: gitDirPath,
        PYTHONUNBUFFERED: "1",
        PYTHONIOENCODING: "utf-8",
        PYTHONPATH: pythonPath,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const gi = spawn(requireGit(), gfiArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: process.env,
    });
    attachStderrLines(py.stderr!, "hg-export", handlers?.onLine);
    attachStderrLines(gi.stderr!, "git-import", handlers?.onLine);
    py.stdout!.pipe(gi.stdin!);
    let pyCode: number | null = null;
    let giCode: number | null = null;
    const done = () => {
      if (pyCode === null || giCode === null) return;
      if (pyCode !== 0 || giCode !== 0) {
        reject(
          new Error(
            `Conversion failed (hg-fast-export.py=${pyCode}, git fast-import=${giCode})`,
          ),
        );
      } else resolve();
    };
    py.on("close", (c) => {
      pyCode = c ?? 1;
      gi.stdin?.end();
      done();
    });
    gi.on("close", (c) => {
      giCode = c ?? 1;
      done();
    });
    py.on("error", reject);
    gi.on("error", reject);
  });
}

export async function convertHgToGit(
  config: HgToGitConfig,
  handlers?: ConvertStreamHandlers,
): Promise<ConvertResult> {
  const fastExportDir = ensureFastExport(config.fastExportPath);
  const python = findPython(config.python);
  const gd = gitDir(config.gitRepo);
  const tipBefore = readImportedTip(gd);
  const incremental = tipBefore > 0;

  backupStateFiles(gd);
  const marks = path.join(gd, `${STATE_PREFIX}-marks`);
  if (!existsSync(marks)) writeFileSync(marks, "");

  const pyArgs = buildPythonArgs(config, fastExportDir, gd);
  await runPipe(
    python,
    pyArgs,
    config.gitRepo,
    gd,
    fastExportDir,
    false,
    config.force,
    handlers,
  );
  mergeMarks(gd);
  writeHeadsCache(config.gitRepo, gd);

  const tipAfter = readImportedTip(gd);
  const revisionsImported = Math.max(0, tipAfter - tipBefore);

  if (config.repackAfterImport) {
    spawnSync(requireGit(), ["-C", config.gitRepo, "gc", "--auto"], {
      windowsHide: true,
      env: process.env,
    });
  }

  // fast-import updates refs/objects only; checkout restores the working tree.
  const checkoutBranch = config.defaultBranch?.trim();
  if (config.checkoutWorkingTree && checkoutBranch) {
    const co = spawnSync(
      requireGit(),
      ["-C", config.gitRepo, "checkout", "-f", checkoutBranch],
      { encoding: "utf8", windowsHide: true, env: process.env },
    );
    if (co.status !== 0) {
      throw new Error(
        `Import finished but checkout of '${checkoutBranch}' failed: ${(co.stderr || co.stdout || "").trim()}`,
      );
    }
  }

  return {
    incremental,
    revisionsImported,
    gitDir: gd,
    stateFiles: ["state", "marks", "mapping", "heads"].map(
      (s) => `${STATE_PREFIX}-${s}`,
    ),
  };
}
