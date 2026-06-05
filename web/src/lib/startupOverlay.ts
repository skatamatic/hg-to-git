import type { ToolchainReport } from "../types";
import type { StartupBlockingMode } from "../components/StartupBlockingOverlay";
import { UI_COPY } from "./uiCopy";

export function resolveStartupBlockingMode(input: {
  toolchainLoading: boolean;
  toolchain: ToolchainReport | null;
  projectsLoading: boolean;
  projectLoadPending: boolean;
  projectName?: string;
  projectLoadDetail?: string;
}): StartupBlockingMode | null {
  const {
    toolchainLoading,
    toolchain,
    projectsLoading,
    projectLoadPending,
    projectName,
    projectLoadDetail,
  } = input;

  if (toolchainLoading) {
    return {
      type: "loading",
      title: UI_COPY.checkingDependencies,
      subtitle: UI_COPY.checkingDependenciesDetail,
    };
  }

  if (toolchain && !toolchain.ok) {
    return { type: "deps", report: toolchain };
  }

  if (projectsLoading) {
    return {
      type: "loading",
      title: UI_COPY.loadingWorkspace,
      subtitle: UI_COPY.loadingWorkspaceDetail,
    };
  }

  if (projectLoadPending) {
    return {
      type: "loading",
      title: projectName
        ? `${UI_COPY.refreshingStatus} — ${projectName}`
        : UI_COPY.refreshingStatus,
      subtitle: projectLoadDetail ?? UI_COPY.refreshingStatusDetail,
    };
  }

  return null;
}

export function depsSatisfied(toolchain: ToolchainReport | null): boolean {
  return toolchain?.ok === true;
}
