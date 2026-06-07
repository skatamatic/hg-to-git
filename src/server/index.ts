import express from "express";
import cors from "cors";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  apiCheckToolchain,
  apiConvert,
  apiCreateProject,
  apiDeleteProject,
  apiGetProjectsState,
  apiGetSettings,
  apiGetSnapshot,
  apiGetBranchHistory,
  apiInstallToolchain,
  apiOpenProject,
  apiPickPathSystem,
  apiPickSavePathSystem,
  apiSaveProject,
  apiSaveSettings,
  apiValidate,
  apiFixGitIgnoreCase,
  apiResetGitTarget,
} from "../backend.js";
import { refreshResolvedTools } from "../deps/resolveTools.js";

const BASE_PORT = Number(process.env.HG_TO_GIT_UI_PORT ?? 3847);
const MAX_PORT_TRIES = 20;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT_FILE = path.resolve(__dirname, "../../.dev-api-port");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/settings", async (_req, res) => {
  res.json(await apiGetSettings());
});

app.put("/api/settings", async (req, res) => {
  res.json(await apiSaveSettings(req.body ?? {}));
});

app.get("/api/deps", (_req, res) => {
  res.json(apiCheckToolchain());
});

app.post("/api/deps/install", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const toolIds = (req.body?.toolIds ?? []) as import("../deps/toolchain.js").ToolId[];
    const result = await apiInstallToolchain(toolIds, (message) =>
      send("log", { message }),
    );
    send("done", result);
  } catch (e) {
    send("error", { message: String(e) });
  } finally {
    res.end();
  }
});

app.get("/api/projects", async (_req, res) => {
  res.json(await apiGetProjectsState());
});

app.post("/api/projects", async (req, res) => {
  try {
    res.json(await apiCreateProject(req.body ?? {}));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.post("/api/projects/:id/open", async (req, res) => {
  try {
    res.json(await apiOpenProject(String(req.params.id)));
  } catch (e) {
    res.status(404).json({ error: String(e) });
  }
});

app.put("/api/projects/:id", async (req, res) => {
  try {
    const { syncLegacySettingsFromProject } = await import("./projects.js");
    const result = await apiSaveProject(String(req.params.id), req.body ?? {});
    await syncLegacySettingsFromProject(result.project);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.delete("/api/projects/:id", async (req, res) => {
  try {
    res.json(await apiDeleteProject(String(req.params.id)));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.post("/api/projects/import-file", async (req, res) => {
  try {
    const { apiImportProjectFromFile } = await import("./projects.js");
    const filePath = String(req.body?.filePath ?? "").trim();
    if (!filePath) {
      res.status(400).json({ error: "filePath is required" });
      return;
    }
    res.json(await apiImportProjectFromFile(filePath));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.post("/api/projects/:id/save-file", async (req, res) => {
  try {
    const { apiSaveProjectToFile } = await import("./projects.js");
    const filePath = String(req.body?.filePath ?? "").trim();
    if (!filePath) {
      res.status(400).json({ error: "filePath is required" });
      return;
    }
    const partial = req.body?.partial;
    res.json(
      await apiSaveProjectToFile(
        String(req.params.id),
        filePath,
        partial && typeof partial === "object" ? partial : undefined,
      ),
    );
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.post("/api/pick-path", (req, res) => {
  const body = req.body ?? {};
  const kind = body.kind === "file" ? "file" : "directory";
  res.json(
    apiPickPathSystem({
      kind,
      title: body.title,
      defaultPath: body.defaultPath,
      fileFilter: body.fileFilter,
    }),
  );
});

app.post("/api/pick-save-path", (req, res) => {
  const body = req.body ?? {};
  res.json(
    apiPickSavePathSystem({
      title: body.title,
      defaultPath: body.defaultPath,
      suggestedName: body.suggestedName,
      fileFilter: body.fileFilter,
    }),
  );
});

app.get("/api/pick-path", (req, res) => {
  const kind = req.query.kind === "file" ? "file" : "directory";
  res.json(
    apiPickPathSystem({
      kind,
      title: String(req.query.title ?? "").trim() || undefined,
      defaultPath: String(req.query.defaultPath ?? "").trim() || undefined,
    }),
  );
});

app.get("/api/snapshot", async (req, res) => {
  const hgRepo = String(req.query.hgRepo ?? "");
  const gitRepo = String(req.query.gitRepo ?? "");
  const defaultBranch = String(req.query.defaultBranch ?? "").trim() || undefined;
  const branchesMap = String(req.query.branchesMap ?? "").trim() || undefined;
  const stream = String(req.query.stream ?? "") === "1";

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const flush = (res as { flush?: () => void }).flush;
    if (typeof flush === "function") flush.call(res);
  };

  try {
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const snapshot = await apiGetSnapshot(
        hgRepo,
        gitRepo,
        { defaultBranch, branchesMap },
        (detail) => send("progress", { detail }),
      );
      send("done", snapshot);
      res.end();
      return;
    }

    res.json(await apiGetSnapshot(hgRepo, gitRepo, { defaultBranch, branchesMap }));
  } catch (e) {
    if (stream) {
      send("error", { message: String(e) });
      res.end();
    } else {
      res.status(400).json({ error: String(e) });
    }
  }
});

app.get("/api/branch-history", (req, res) => {
  const hgRepo = String(req.query.hgRepo ?? "");
  const gitRepo = String(req.query.gitRepo ?? "");
  const hgBranch = String(req.query.hgBranch ?? "").trim() || undefined;
  const gitBranch = String(req.query.gitBranch ?? "").trim() || undefined;
  const limit = parseInt(String(req.query.limit ?? "10"), 10);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);
  const defaultBranch =
    String(req.query.defaultBranch ?? "").trim() || undefined;
  try {
    res.json(
      apiGetBranchHistory(hgRepo, gitRepo, {
        hgBranch,
        gitBranch,
        defaultBranch,
        limit: Number.isNaN(limit) ? 10 : limit,
        offset: Number.isNaN(offset) ? 0 : offset,
      }),
    );
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.post("/api/validate", async (req, res) => {
  try {
    res.json(await apiValidate(req.body ?? {}));
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e) });
  }
});

app.post("/api/git/fix-ignore-case", (req, res) => {
  try {
    const gitRepo = String(req.body?.gitRepo ?? "");
    res.json(apiFixGitIgnoreCase(gitRepo));
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e) });
  }
});

app.post("/api/git/reset-target", (req, res) => {
  try {
    const gitRepo = String(req.body?.gitRepo ?? "");
    res.json(apiResetGitTarget(gitRepo));
  } catch (e) {
    res.status(400).json({ ok: false, error: String(e) });
  }
});

app.post("/api/convert", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const flush = (res as { flush?: () => void }).flush;
    if (typeof flush === "function") flush.call(res);
  };

  try {
    const body = req.body ?? {};
    send("start", {
      hgRepo: body.hgRepo,
      gitRepo: body.gitRepo,
    });
    const { result, snapshot } = await apiConvert(
      body,
      (log) => send("log", log),
      (detail) => send("snapshot-progress", { detail }),
    );
    send("done", { result, snapshot });
  } catch (e) {
    send("error", { message: String(e) });
  } finally {
    res.end();
  }
});

const webDist = path.resolve(__dirname, "../../web/dist");
if (existsSync(webDist)) {
  const staticMw = express.static(webDist);
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    staticMw(req, res, next);
  });
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(webDist, "index.html"));
  });
}

function writePortFile(port: number) {
  writeFileSync(PORT_FILE, `${port}\n`, "utf8");
}

function clearPortFile() {
  try {
    if (existsSync(PORT_FILE)) unlinkSync(PORT_FILE);
  } catch {
    /* ignore */
  }
}

function listen(port: number, attempt = 0) {
  const server = app.listen(port, () => {
    writePortFile(port);
    console.log(`hg-to-git API listening on http://127.0.0.1:${port}`);
    if (port !== BASE_PORT) {
      console.log(`(Port ${BASE_PORT} was busy; using ${port} instead.)`);
    }
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && attempt < MAX_PORT_TRIES - 1) {
      listen(port + 1, attempt + 1);
      return;
    }
    clearPortFile();
    if (err.code === "EADDRINUSE") {
      console.error(
        `No free port between ${BASE_PORT} and ${BASE_PORT + MAX_PORT_TRIES - 1}. Stop other hg-to-git instances.`,
      );
    } else {
      console.error(err);
    }
    process.exit(1);
  });
}

refreshResolvedTools();

clearPortFile();
listen(BASE_PORT);
process.on("exit", clearPortFile);
