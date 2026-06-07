/**
 * Headless Electron entry: show one native open dialog.
 * Used by the HTTP API on Windows so browser dev mode can spawn a real OS picker.
 * Results are written to HG_PICK_OUT (avoids polluted stdout from Chromium).
 */
import { app, dialog } from "electron";
import { writeFileSync } from "node:fs";

interface PickRequest {
  kind: "directory" | "file" | "save-file";
  title?: string;
  defaultPath?: string;
  suggestedName?: string;
  fileFilter?: "project" | "all";
}

function readRequest(): PickRequest {
  const raw = process.env.HG_PICK_JSON;
  if (!raw) throw new Error("HG_PICK_JSON missing");
  return JSON.parse(raw) as PickRequest;
}

function writeResult(payload: { path: string | null; cancelled: boolean }) {
  const out = process.env.HG_PICK_OUT;
  if (!out) throw new Error("HG_PICK_OUT missing");
  writeFileSync(out, JSON.stringify(payload), "utf8");
}

app.commandLine.appendSwitch("disable-logging");
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  try {
    const req = readRequest();
    if (req.kind === "save-file") {
      const result = await dialog.showSaveDialog({
        title: req.title ?? "Save file",
        defaultPath: req.defaultPath,
        filters:
          req.fileFilter === "project"
            ? [
                { name: "hg-to-git project", extensions: ["hg-to-git-project.json", "json"] },
                { name: "All files", extensions: ["*"] },
              ]
            : [
                { name: "All files", extensions: ["*"] },
              ],
      });
      writeResult({
        path: result.canceled ? null : (result.filePath ?? null),
        cancelled: result.canceled,
      });
      return;
    }

    const result = await dialog.showOpenDialog({
      title: req.title ?? (req.kind === "directory" ? "Select folder" : "Select file"),
      defaultPath: req.defaultPath,
      properties:
        req.kind === "directory" ? ["openDirectory"] : ["openFile"],
      filters:
        req.kind === "file"
          ? req.fileFilter === "project"
            ? [
                { name: "hg-to-git project", extensions: ["hg-to-git-project.json", "json"] },
                { name: "All files", extensions: ["*"] },
              ]
            : [{ name: "All files", extensions: ["*"] }]
          : undefined,
    });

    writeResult({
      path: result.canceled ? null : (result.filePaths[0] ?? null),
      cancelled: result.canceled,
    });
  } catch (e) {
    process.stderr.write(String(e));
    process.exitCode = 1;
  } finally {
    app.exit(0);
  }
});
