import {
  loadLocalProjects,
  localCreateProject,
  localDeleteProject,
  localOpenProject,
  localSaveProject,
  saveLocalProjects,
} from "./lib/localProjects";
import type {
  Project,
  ProjectsState,
  BranchHistoryResult,
  RepoSnapshot,
  ToolchainReport,
  ToolId,
} from "./types";

const API = "";

function bridge() {
  if (typeof window === "undefined") return undefined;
  return window.hgToGit;
}

export function isElectron(): boolean {
  return Boolean(bridge()?.isElectron);
}

/** In-window menu on Windows/Linux Electron; macOS uses the system menu bar. */
export function useInWindowMenuBar(): boolean {
  const b = bridge();
  if (!b?.isElectron) return true;
  return b.platform !== "darwin";
}

export function syncThemeChrome(theme: "light" | "dark"): void {
  bridge()?.syncThemeChrome?.(theme);
}

export async function fetchToolchain(): Promise<ToolchainReport> {
  const b = bridge();
  if (b?.checkToolchain) return b.checkToolchain() as Promise<ToolchainReport>;
  return fetchJson<ToolchainReport>(`${API}/api/deps`);
}

export function installToolchain(
  toolIds: ToolId[],
  handlers: {
    onLog: (message: string) => void;
    onDone: (data: {
      ok: boolean;
      report: ToolchainReport;
      logs: string[];
    }) => void;
    onError: (message: string) => void;
  },
): () => void {
  const b = bridge();
  if (b?.installToolchain) {
    b.installToolchain(toolIds, handlers.onLog)
      .then((res) => handlers.onDone(res as { ok: boolean; report: ToolchainReport; logs: string[] }))
      .catch((e: unknown) => handlers.onError(String(e)));
    return () => {};
  }

  const ctrl = new AbortController();
  (async () => {
    const r = await fetch(`${API}/api/deps/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolIds }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      handlers.onError(await r.text());
      return;
    }
    const reader = r.body?.getReader();
    if (!reader) {
      handlers.onError("No response body");
      return;
    }
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const blocks = buf.split("\n\n");
      buf = blocks.pop() ?? "";
      for (const block of blocks) {
        let event = "message";
        let data = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event: ")) event = line.slice(7);
          else if (line.startsWith("data: ")) data = line.slice(6);
        }
        if (!data) continue;
        try {
          const parsed = JSON.parse(data);
          if (event === "log") handlers.onLog(String(parsed.message ?? ""));
          else if (event === "done") handlers.onDone(parsed);
          else if (event === "error") handlers.onError(String(parsed.message));
        } catch {
          /* ignore */
        }
      }
    }
  })().catch((e) => handlers.onError(String(e)));
  return () => ctrl.abort();
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const contentType = r.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      r.status === 502 || r.status === 504
        ? "API server not running. Use npm run dev:ui or npm run electron:dev."
        : `Unexpected response (${r.status})`,
    );
  }
  const data = await r.json();
  if (!r.ok) {
    throw new Error(String((data as { error?: string }).error ?? r.statusText));
  }
  return data as T;
}

export async function fetchProjects(): Promise<ProjectsState> {
  const b = bridge();
  if (b) {
    try {
      return (await b.getProjects()) as ProjectsState;
    } catch (e) {
      throw new Error(String(e));
    }
  }
  try {
    const state = await fetchJson<ProjectsState>(`${API}/api/projects`);
    saveLocalProjects(state);
    return state;
  } catch {
    return loadLocalProjects();
  }
}

export async function createProject(input?: {
  name?: string;
  hgRepo?: string;
  gitRepo?: string;
}): Promise<{ state: ProjectsState; project: Project }> {
  const b = bridge();
  if (b) {
    const result = (await b.createProject(input)) as {
      state: ProjectsState;
      project: Project;
    };
    if (!result?.state?.lastProjectId) {
      throw new Error("Failed to create project (invalid response)");
    }
    return result;
  }
  try {
    const result = await fetchJson<{ state: ProjectsState; project: Project }>(
      `${API}/api/projects`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input ?? {}),
      },
    );
    saveLocalProjects(result.state);
    return result;
  } catch (e) {
    return localCreateProject(input);
  }
}

export async function openProject(id: string): Promise<ProjectsState> {
  const b = bridge();
  if (b) {
    const state = (await b.openProject(id)) as ProjectsState;
    if (!state?.projects?.some((p) => p.id === id)) {
      throw new Error("Failed to open project");
    }
    return state;
  }
  try {
    const state = await fetchJson<ProjectsState>(
      `${API}/api/projects/${encodeURIComponent(id)}/open`,
      { method: "POST" },
    );
    saveLocalProjects(state);
    return state;
  } catch {
    return localOpenProject(id);
  }
}

export async function saveProject(
  id: string,
  partial: Partial<Project>,
): Promise<{ state: ProjectsState; project: Project }> {
  const b = bridge();
  if (b) {
    return (await b.saveProject(id, partial)) as {
      state: ProjectsState;
      project: Project;
    };
  }
  try {
    const result = await fetchJson<{ state: ProjectsState; project: Project }>(
      `${API}/api/projects/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      },
    );
    saveLocalProjects(result.state);
    return result;
  } catch {
    return localSaveProject(id, partial);
  }
}

export async function deleteProject(id: string): Promise<ProjectsState> {
  const b = bridge();
  if (b) return (await b.deleteProject(id)) as ProjectsState;
  try {
    const state = await fetchJson<ProjectsState>(
      `${API}/api/projects/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    saveLocalProjects(state);
    return state;
  } catch {
    return localDeleteProject(id);
  }
}

export async function importProjectFromFile(
  filePath: string,
): Promise<{ state: ProjectsState; project: Project }> {
  const b = bridge();
  if (b?.importProjectFile) {
    return (await b.importProjectFile(filePath)) as {
      state: ProjectsState;
      project: Project;
    };
  }
  const result = await fetchJson<{ state: ProjectsState; project: Project }>(
    `${API}/api/projects/import-file`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath }),
    },
  );
  saveLocalProjects(result.state);
  return result;
}

export async function saveProjectToFile(
  id: string,
  filePath: string,
  partial?: Partial<Project>,
): Promise<{ state: ProjectsState; project: Project }> {
  const b = bridge();
  if (b?.saveProjectFile) {
    return (await b.saveProjectFile(id, filePath, partial)) as {
      state: ProjectsState;
      project: Project;
    };
  }
  const result = await fetchJson<{ state: ProjectsState; project: Project }>(
    `${API}/api/projects/${encodeURIComponent(id)}/save-file`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath, partial }),
    },
  );
  saveLocalProjects(result.state);
  return result;
}

export function syncMenu(state: {
  projects: Project[];
  recentProjectIds?: string[];
  activeProjectId: string | null;
  view: string;
  simpleMode?: boolean;
  projectConfigured?: boolean;
  menuRestricted?: boolean;
}): void {
  const b = bridge();
  if (b?.syncMenu) void b.syncMenu(state);
}

export function subscribeAppCommand(
  handler: (payload: { command: string; payload?: unknown }) => void,
): () => void {
  const b = bridge();
  if (b?.onAppCommand) return b.onAppCommand(handler);
  return () => {};
}

export function subscribeRequestExit(handler: () => void): () => void {
  const b = bridge();
  if (b?.onRequestExit) return b.onRequestExit(handler);
  return () => {};
}

export function confirmAppQuit(): void {
  const b = bridge();
  if (b?.confirmQuit) {
    void b.confirmQuit();
    return;
  }
  window.close();
}

export async function fetchSnapshot(
  hgRepo: string,
  gitRepo: string,
  options?: {
    defaultBranch?: string;
    branchesMap?: string;
    onProgress?: (detail: string) => void;
  },
): Promise<RepoSnapshot> {
  const b = bridge();
  if (b) {
    return b.getSnapshot(hgRepo, gitRepo, options) as Promise<RepoSnapshot>;
  }

  const q = new URLSearchParams({ hgRepo, gitRepo });
  if (options?.defaultBranch) q.set("defaultBranch", options.defaultBranch);
  if (options?.branchesMap) q.set("branchesMap", options.branchesMap);

  if (options?.onProgress) {
    q.set("stream", "1");
    const r = await fetch(`${API}/api/snapshot?${q}`);
    if (!r.ok) throw new Error("Failed to load snapshot");
    const reader = r.body?.getReader();
    if (!reader) throw new Error("No response body");
    const dec = new TextDecoder();
    let buf = "";
    let snapshot: RepoSnapshot | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const blocks = buf.split("\n\n");
      buf = blocks.pop() ?? "";
      for (const block of blocks) {
        let event = "message";
        let data = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event: ")) event = line.slice(7);
          else if (line.startsWith("data: ")) data = line.slice(6);
        }
        if (!data) continue;
        try {
          const parsed = JSON.parse(data);
          if (event === "progress") {
            options.onProgress(String(parsed.detail ?? ""));
          } else if (event === "done") {
            snapshot = parsed as RepoSnapshot;
          } else if (event === "error") {
            throw new Error(String(parsed.message ?? "Snapshot failed"));
          }
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
    if (!snapshot) throw new Error("Snapshot response incomplete");
    return snapshot;
  }

  const r = await fetch(`${API}/api/snapshot?${q}`);
  if (!r.ok) throw new Error("Failed to load snapshot");
  return r.json();
}

export async function fetchBranchHistory(
  hgRepo: string,
  gitRepo: string,
  query: {
    hgBranch?: string;
    gitBranch?: string;
    defaultBranch?: string;
    limit?: number;
    offset?: number;
  },
): Promise<BranchHistoryResult> {
  const b = bridge();
  if (b?.getBranchHistory) {
    return b.getBranchHistory(hgRepo, gitRepo, query) as Promise<BranchHistoryResult>;
  }
  const q = new URLSearchParams({ hgRepo, gitRepo });
  if (query.hgBranch) q.set("hgBranch", query.hgBranch);
  if (query.gitBranch) q.set("gitBranch", query.gitBranch);
  if (query.defaultBranch) q.set("defaultBranch", query.defaultBranch);
  if (query.limit != null) q.set("limit", String(query.limit));
  if (query.offset != null) q.set("offset", String(query.offset));
  const r = await fetch(`${API}/api/branch-history?${q}`);
  if (!r.ok) throw new Error("Failed to load branch history");
  return r.json();
}

export interface IgnoreCaseStatus {
  enabled: boolean;
  raw?: string;
  problematic: boolean;
  message?: string;
}

export async function resetGitTarget(gitRepo: string): Promise<{
  ok: boolean;
  error?: string;
  gitTarget?: { empty: boolean; problematic: boolean; foreignBranches: string[] };
}> {
  const b = bridge();
  if (b?.resetGitTarget) {
    return b.resetGitTarget(gitRepo) as Promise<{
      ok: boolean;
      error?: string;
      gitTarget?: { empty: boolean; problematic: boolean; foreignBranches: string[] };
    }>;
  }
  const r = await fetch(`${API}/api/git/reset-target`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gitRepo }),
  });
  return r.json();
}

export async function fixGitIgnoreCase(gitRepo: string): Promise<{
  ok: boolean;
  error?: string;
  ignoreCase?: IgnoreCaseStatus;
}> {
  const b = bridge();
  if (b?.fixGitIgnoreCase) {
    return b.fixGitIgnoreCase(gitRepo) as Promise<{
      ok: boolean;
      error?: string;
      ignoreCase?: IgnoreCaseStatus;
    }>;
  }
  const r = await fetch(`${API}/api/git/fix-ignore-case`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gitRepo }),
  });
  return r.json();
}

export async function validateRepos(body: {
  hgRepo: string;
  gitRepo: string;
  force?: boolean;
}): Promise<{
  ok: boolean;
  error?: string;
  versions?: Record<string, string>;
  ignoreCase?: IgnoreCaseStatus;
}> {
  const b = bridge();
  if (b) {
    try {
      return (await b.validate({
        ...body,
        sanitizeNames: false,
        hgTags: true,
        repackAfterImport: true,
      })) as {
        ok: boolean;
        error?: string;
        versions?: Record<string, string>;
        ignoreCase?: IgnoreCaseStatus;
      };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
  const r = await fetch(`${API}/api/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...body,
      sanitizeNames: false,
      hgTags: true,
      repackAfterImport: true,
    }),
  });
  return r.json();
}

export async function pickPath(options: {
  kind: "directory" | "file";
  title?: string;
  defaultPath?: string;
  fileFilter?: "project" | "all";
}): Promise<{ path: string | null; cancelled: boolean; error?: string }> {
  const b = bridge();
  if (b) {
    try {
      return await b.pickPath(options);
    } catch (e) {
      return { path: null, cancelled: true, error: String(e) };
    }
  }

  try {
    const r = await fetch(`${API}/api/pick-path`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });
    const contentType = r.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      const text = await r.text().catch(() => "");
      return {
        path: null,
        cancelled: true,
        error:
          text.includes("<!DOCTYPE") || text.includes("<html")
            ? "API server not running. Restart npm run dev:ui and wait until the terminal shows “API listening”."
            : `Unexpected picker response (${r.status}).`,
      };
    }
    const data = await r.json();
    if (!r.ok) {
      return {
        path: null,
        cancelled: true,
        error: String(data.error ?? r.statusText),
      };
    }
    return data;
  } catch (e) {
    return {
      path: null,
      cancelled: true,
      error: `Cannot reach API: ${String(e)}. Run npm run dev:ui (browser) or npm run electron:dev (desktop).`,
    };
  }
}

export async function pickSavePath(options: {
  title?: string;
  defaultPath?: string;
  suggestedName?: string;
  fileFilter?: "project" | "all";
}): Promise<{ path: string | null; cancelled: boolean; error?: string }> {
  const b = bridge();
  if (b?.pickSavePath) {
    try {
      return await b.pickSavePath(options);
    } catch (e) {
      return { path: null, cancelled: true, error: String(e) };
    }
  }

  try {
    const r = await fetch(`${API}/api/pick-save-path`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });
    const data = await r.json();
    if (!r.ok) {
      return {
        path: null,
        cancelled: true,
        error: String(data.error ?? r.statusText),
      };
    }
    return data;
  } catch (e) {
    return {
      path: null,
      cancelled: true,
      error: `Cannot reach API: ${String(e)}.`,
    };
  }
}

export function runConvert(
  body: Record<string, unknown>,
  handlers: {
    onLog: (data: Record<string, unknown>) => void;
    onDone: (data: { result: unknown; snapshot: RepoSnapshot }) => void;
    onError: (message: string) => void;
    onStart?: () => void;
    onSnapshotProgress?: (detail: string) => void;
  },
): () => void {
  const b = bridge();
  if (b) {
    handlers.onStart?.();
    b
      .convert(body, handlers.onLog, handlers.onSnapshotProgress)
      .then((res: { ok: boolean; result?: unknown; snapshot?: unknown; error?: string }) => {
        if (res.ok && res.result != null && res.snapshot != null) {
          handlers.onDone({
            result: res.result,
            snapshot: res.snapshot as RepoSnapshot,
          });
        } else {
          handlers.onError(res.error ?? "Conversion failed");
        }
      })
      .catch((e: unknown) => handlers.onError(String(e)));
    return () => {};
  }

  const ctrl = new AbortController();

  (async () => {
    const r = await fetch(`${API}/api/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: r.statusText }));
      handlers.onError(String(err.error ?? r.statusText));
      return;
    }
    const reader = r.body?.getReader();
    if (!reader) {
      handlers.onError("No response body");
      return;
    }
    const dec = new TextDecoder();
    let buf = "";
    handlers.onStart?.();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const blocks = buf.split("\n\n");
      buf = blocks.pop() ?? "";
      for (const block of blocks) {
        let event = "message";
        let data = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event: ")) event = line.slice(7);
          else if (line.startsWith("data: ")) data = line.slice(6);
        }
        if (!data) continue;
        try {
          const parsed = JSON.parse(data);
          if (event === "log") handlers.onLog(parsed);
          else if (event === "snapshot-progress") {
            handlers.onSnapshotProgress?.(String(parsed.detail ?? ""));
          } else if (event === "done") handlers.onDone(parsed);
          else if (event === "error") handlers.onError(parsed.message);
        } catch {
          /* ignore malformed */
        }
      }
    }
  })();

  return () => ctrl.abort();
}
