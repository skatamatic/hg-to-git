/** Short labels for tooltips, titles, and inline hints. */

export const REPOSITORIES_IN_SYNC = "Repositories are already in sync.";

export const UI_COPY = {
  refresh: "Refresh",
  browse: (label: string) => `Browse for ${label}`,
  forceRun: "Run with force",
  repositoriesInSync: REPOSITORIES_IN_SYNC,
  loadingProject: "Loading project",
  refreshingStatus: "Refreshing status",
  refreshingStatusDetail: "Starting repository scan…",
  checkingDependencies: "Checking dependencies",
  checkingDependenciesDetail: "Looking for Git, Mercurial, and Python…",
  loadingWorkspace: "Loading workspace",
  loadingWorkspaceDetail: "Reading projects and settings…",
  exit: "Exit",
  saveChangesTitle: "Save changes?",
  saveChangesDetail:
    "This project has unsaved changes. Save before leaving?",
  quitDuringConvertTitle: "Quit during conversion?",
  quitDuringConvertDetail:
    "Leaving now may corrupt the Git target repository.",
  save: "Save",
  dontSave: "Don't save",
  cancel: "Cancel",
  quitAnyway: "Quit anyway",
} as const;
