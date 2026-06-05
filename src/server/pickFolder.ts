import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type PickKind = "directory" | "file";

export interface PickResult {
  path: string | null;
  cancelled?: boolean;
  error?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveElectronExecutable(): string | null {
  try {
    const require = createRequire(import.meta.url);
    return require("electron") as string;
  } catch {
    return null;
  }
}

/** Native modal picker via a short-lived Electron process (Windows dev:ui). */
function pickViaElectron(
  kind: PickKind,
  options: { title?: string; defaultPath?: string },
): PickResult {
  const electron = resolveElectronExecutable();
  const cliScript = path.resolve(__dirname, "../electron/pickDialogCli.js");
  if (!electron || !existsSync(cliScript)) {
    return { path: null, error: "Electron picker unavailable" };
  }

  const payload = {
    kind,
    title: options.title,
    defaultPath: options.defaultPath,
  };

  const outFile = path.join(mkdtempSync(path.join(tmpdir(), "hg-pick-")), "result.json");

  const r = spawnSync(electron, [cliScript], {
    env: {
      ...process.env,
      HG_PICK_JSON: JSON.stringify(payload),
      HG_PICK_OUT: outFile,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
    encoding: "utf8",
    windowsHide: false,
    timeout: 120_000,
  });

  try {
    if (r.error) {
      return { path: null, error: r.error.message };
    }
    if (r.status !== 0) {
      return {
        path: null,
        error: r.stderr?.trim() || `Picker exited with code ${r.status}`,
      };
    }
    if (!existsSync(outFile)) {
      return { path: null, cancelled: true };
    }
    const parsed = JSON.parse(readFileSync(outFile, "utf8")) as {
      path: string | null;
      cancelled?: boolean;
    };
    return {
      path: parsed.path,
      cancelled: parsed.cancelled ?? parsed.path == null,
    };
  } catch (e) {
    return { path: null, error: `Invalid picker output: ${String(e)}` };
  } finally {
    try {
      rmSync(path.dirname(outFile), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

export function pickPath(
  kind: PickKind,
  options: { title?: string; defaultPath?: string } = {},
): PickResult {
  const title =
    options.title ?? (kind === "directory" ? "Select folder" : "Select file");
  const defaultPath = options.defaultPath?.trim();

  try {
    if (process.platform === "win32") {
      const viaElectron = pickViaElectron(kind, { title, defaultPath });
      if (!viaElectron.error) return viaElectron;
      return kind === "directory"
        ? pickWindowsFolderFallback(title, defaultPath)
        : pickWindowsFileFallback(title, defaultPath);
    }
    if (process.platform === "darwin") {
      return { path: pickMac(kind, title, defaultPath) };
    }
    return { path: pickLinux(kind, title, defaultPath) };
  } catch (e) {
    return { path: null, error: String(e) };
  }
}

/** WinForms modal loop — fallback when Electron helper is unavailable. */
function psModalPickScript(body: string, resultPath: string): string {
  const escapedResult = resultPath.replace(/'/g, "''");
  return `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[void][System.Windows.Forms.Application]::EnableVisualStyles()

$owner = New-Object System.Windows.Forms.Form
$owner.Text = 'hg-to-git'
$owner.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$owner.ShowInTaskbar = $false
$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.Opacity = 0
$owner.TopMost = $true
$owner.Load.Add({
  ${body}
  $owner.Close()
})
[void][System.Windows.Forms.Application]::Run($owner)
`;
}

function pickWindowsFolderFallback(title: string, defaultPath?: string): PickResult {
  const start =
    defaultPath && existsSync(defaultPath)
      ? defaultPath
      : defaultPath && existsSync(path.dirname(defaultPath))
        ? path.dirname(defaultPath)
        : "";
  const resultPath = path.join(mkdtempSync(path.join(tmpdir(), "hg-pick-")), "result.txt");
  const escapedResult = resultPath.replace(/'/g, "''");
  const body = `
  $d = New-Object System.Windows.Forms.FolderBrowserDialog
  $d.Description = '${title.replace(/'/g, "''")}'
  $d.ShowNewFolderButton = $true
  ${start ? `$d.SelectedPath = '${start.replace(/'/g, "''")}'` : ""}
  if ($d.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
    [IO.File]::WriteAllText('${escapedResult}', $d.SelectedPath)
  }
`;
  return runPs1ScriptWithResult(psModalPickScript(body, resultPath), resultPath);
}

function pickWindowsFileFallback(title: string, defaultPath?: string): PickResult {
  const dir =
    defaultPath && existsSync(defaultPath)
      ? existsSync(path.dirname(defaultPath))
        ? path.dirname(defaultPath)
        : defaultPath
      : "";
  const resultPath = path.join(mkdtempSync(path.join(tmpdir(), "hg-pick-")), "result.txt");
  const escapedResult = resultPath.replace(/'/g, "''");
  const body = `
  $d = New-Object System.Windows.Forms.OpenFileDialog
  $d.Title = '${title.replace(/'/g, "''")}'
  $d.Filter = 'All files (*.*)|*.*|Author maps (*.map)|*.map'
  ${dir ? `$d.InitialDirectory = '${dir.replace(/'/g, "''")}'` : ""}
  if ($d.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
    [IO.File]::WriteAllText('${escapedResult}', $d.FileName)
  }
`;
  return runPs1ScriptWithResult(psModalPickScript(body, resultPath), resultPath);
}

function runPs1ScriptWithResult(script: string, resultPath: string): PickResult {
  const workDir = path.dirname(resultPath);
  const ps1 = path.join(workDir, "pick.ps1");
  writeFileSync(ps1, script, "utf8");

  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", ps1],
    { stdio: "ignore", windowsHide: false, timeout: 600_000 },
  );

  try {
    if (existsSync(resultPath)) {
      return { path: readFileSync(resultPath, "utf8").trim() || null };
    }
    return {
      path: null,
      cancelled: true,
      error:
        r.error?.message ??
        (r.status !== 0 ? `Picker exited with code ${r.status}` : undefined),
    };
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function pickMac(
  kind: PickKind,
  title: string,
  defaultPath?: string,
): string | null {
  const escaped = title.replace(/"/g, '\\"');
  let script: string;
  if (kind === "directory") {
    script = `POSIX path of (choose folder with prompt "${escaped}"`;
    if (defaultPath && existsSync(defaultPath)) {
      script += ` default location POSIX file "${defaultPath.replace(/"/g, '\\"')}"`;
    }
    script += ")";
  } else {
    script = `POSIX path of (choose file with prompt "${escaped}"`;
    if (defaultPath) {
      const dir = existsSync(defaultPath)
        ? path.dirname(defaultPath)
        : defaultPath;
      if (existsSync(dir)) {
        script += ` default location POSIX file "${dir.replace(/"/g, '\\"')}"`;
      }
    }
    script += ")";
  }
  const r = spawnSync("osascript", ["-e", script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return (r.stdout ?? "").trim() || null;
}

function pickLinux(
  kind: PickKind,
  title: string,
  defaultPath?: string,
): string | null {
  const zenity = spawnSync("which", ["zenity"], { encoding: "utf8" });
  if (zenity.status !== 0) return null;

  const args =
    kind === "directory"
      ? ["--file-selection", "--directory", `--title=${title}`, "--modal"]
      : ["--file-selection", `--title=${title}`, "--modal"];
  if (defaultPath && existsSync(defaultPath)) {
    args.push(`--filename=${defaultPath}/`);
  }
  const r = spawnSync("zenity", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return (r.stdout ?? "").trim() || null;
}
