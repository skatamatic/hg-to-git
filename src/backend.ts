import { loadConfig, resolveConfigPath } from "./config.js";
import { runConversionInWorker } from "./convertRunner.js";
import { clearHgNodeToGitCache, getBranchHistory } from "./branchHistory.js";
import { getRepoSnapshotAsync } from "./repoSnapshotAsync.js";
import type { SnapshotOptions } from "./snapshotOptions.js";
import { runValidateInWorker } from "./validateRunner.js";
import {
  assertGitRepo,
  assertHgRepo,
  fixIgnoreCase,
  getIgnoreCaseStatus,
} from "./prerequisites.js";
import {
  getGitTargetStatus,
  resetGitTargetEmpty,
} from "./gitTarget.js";
import {
  checkToolchain,
  installTools,
  type ToolId,
} from "./deps/toolchain.js";
import {
  apiParseAuthorsMapFile,
  apiScanHgAuthors,
} from "./authorsMap.js";
import { pickPath as pickPathSystem } from "./server/pickFolder.js";
import { loadUiSettings, saveUiSettings, type UiSettings } from "./server/persist.js";
import {
  apiCreateProject,
  apiDeleteProject,
  apiGetProjectsState,
  apiOpenProject,
  apiSaveProject,
  apiUpdateActiveProjectRun,
  getActiveProject,
  syncLegacySettingsFromProject,
  type Project,
  type ProjectsState,
} from "./server/projects.js";

export type { Project, ProjectsState };
export {
  apiCreateProject,
  apiDeleteProject,
  apiGetProjectsState,
  apiOpenProject,
  apiSaveProject,
  getActiveProject,
  syncLegacySettingsFromProject,
};

export type { ToolId };
export { checkToolchain };

export function apiCheckToolchain() {
  return checkToolchain();
}

export async function apiInstallToolchain(
  toolIds: ToolId[],
  onLog?: (message: string) => void,
) {
  const missing = checkToolchain().tools
    .filter((t) => !t.installed)
    .map((t) => t.id);
  const toInstall =
    toolIds.length > 0
      ? toolIds
      : (missing as ToolId[]);
  return installTools(toInstall, onLog);
}

let convertRunning = false;

export async function apiGetSettings(): Promise<UiSettings> {
  return loadUiSettings();
}

export async function apiSaveSettings(
  partial: Partial<UiSettings>,
): Promise<UiSettings> {
  return saveUiSettings(partial);
}

export async function apiGetSnapshot(
  hgRepo: string,
  gitRepo: string,
  options: SnapshotOptions = {},
  onProgress?: import("./snapshotProgress.js").SnapshotProgressReporter,
) {
  if (!hgRepo || !gitRepo) {
    throw new Error("hgRepo and gitRepo required");
  }

  let snapshotOpts: SnapshotOptions = { ...options };
  try {
    const config = await loadConfig(resolveConfigPath(gitRepo), {
      hgRepo,
      gitRepo,
      defaultBranch: options.defaultBranch,
      branchesMap: options.branchesMap,
    });
    snapshotOpts = {
      defaultBranch: config.defaultBranch,
      branchesMap: config.branchesMap,
    };
  } catch {
    if (!snapshotOpts.defaultBranch) snapshotOpts.defaultBranch = "master";
  }

  return getRepoSnapshotAsync(hgRepo, gitRepo, snapshotOpts, onProgress);
}

export function apiGetBranchHistory(
  hgRepo: string,
  gitRepo: string,
  query: {
    hgBranch?: string;
    gitBranch?: string;
    defaultBranch?: string;
    limit?: number;
    offset?: number;
  },
) {
  if (!hgRepo || !gitRepo) {
    throw new Error("hgRepo and gitRepo required");
  }
  return getBranchHistory(hgRepo, gitRepo, query);
}

export async function apiValidate(body: Record<string, unknown>) {
  return runValidateInWorker(body);
}

export function apiResetGitTarget(gitRepo: string) {
  if (!gitRepo?.trim()) throw new Error("gitRepo is required");
  const gitTarget = resetGitTargetEmpty(gitRepo);
  return { ok: true as const, gitTarget };
}

export function apiFixGitIgnoreCase(gitRepo: string) {
  if (!gitRepo?.trim()) {
    throw new Error("gitRepo is required");
  }
  assertGitRepo(gitRepo);
  const ignoreCase = fixIgnoreCase(gitRepo);
  return { ok: true as const, ignoreCase };
}

export function apiGetHgAuthors(hgRepo: string) {
  return apiScanHgAuthors(hgRepo);
}

export function apiImportAuthorsMap(filePath: string) {
  return apiParseAuthorsMapFile(filePath);
}

export function apiPickPathSystem(options: {
  kind: "directory" | "file";
  title?: string;
  defaultPath?: string;
}) {
  const result = pickPathSystem(options.kind, {
    title: options.title,
    defaultPath: options.defaultPath,
  });
  if (result.error) {
    return { path: null, cancelled: true, error: result.error };
  }
  return {
    path: result.path,
    cancelled: result.cancelled ?? result.path == null,
  };
}

export type ConvertLogHandler = (data: Record<string, unknown>) => void;

export type ConvertSnapshotProgressHandler = (detail: string) => void;

export async function apiConvert(
  body: Record<string, unknown>,
  onLog: ConvertLogHandler,
  onSnapshotProgress?: ConvertSnapshotProgressHandler,
): Promise<{ result: unknown; snapshot: Awaited<ReturnType<typeof getRepoSnapshotAsync>> }> {
  if (convertRunning) {
    throw new Error("Conversion already in progress");
  }

  convertRunning = true;
  try {
    const { result } = await runConversionInWorker(body, onLog);
    const config = await loadConfig(undefined, body);
    clearHgNodeToGitCache(config.gitRepo);
    const snapshot = await getRepoSnapshotAsync(
      config.hgRepo,
      config.gitRepo,
      {
        defaultBranch: config.defaultBranch,
        branchesMap: config.branchesMap,
      },
      onSnapshotProgress,
    );
    await apiUpdateActiveProjectRun("success", {
      hgRepo: config.hgRepo,
      gitRepo: config.gitRepo,
      authorsMap: config.authorsMap,
      authorMappings: body.authorMappings as Project["authorMappings"],
      defaultBranch: config.defaultBranch,
      checkoutWorkingTree: config.checkoutWorkingTree,
    });

    return { result, snapshot };
  } catch (e) {
    await apiUpdateActiveProjectRun("error");
    throw e;
  } finally {
    convertRunning = false;
  }
}
