import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/** Extra directories commonly added by Git/Python installers on Windows. */
export function windowsToolPaths(): string[] {
  if (process.platform !== "win32") return [];

  const local = process.env.LOCALAPPDATA ?? "";
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";

  const candidates = [
    path.join(programFiles, "Git", "cmd"),
    path.join(programFilesX86, "Git", "cmd"),
    path.join(local, "Programs", "Python"),
  ];

  const out: string[] = [];
  for (const base of candidates) {
    if (!existsSync(base)) continue;
    if (base.endsWith("Python")) {
      try {
        for (const name of readdirSync(base, { withFileTypes: true })) {
          if (!name.isDirectory()) continue;
          const root = path.join(base, name.name);
          out.push(root, path.join(root, "Scripts"));
        }
      } catch {
        out.push(base);
      }
    } else {
      out.push(base);
    }
  }
  return out.filter((p) => existsSync(p));
}

export function pathWithWindowsTools(): string {
  const extra = windowsToolPaths();
  const current = process.env.PATH ?? "";
  if (extra.length === 0) return current;
  const parts = [...extra, ...current.split(path.delimiter)];
  return [...new Set(parts)].join(path.delimiter);
}
