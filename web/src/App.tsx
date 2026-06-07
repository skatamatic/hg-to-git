import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  confirmAppQuit,
  fetchSnapshot,
  fetchToolchain,
  pickPath,
  pickSavePath,
  runConvert,
  subscribeRequestExit,
} from "./api";
import { AppDialog } from "./components/AppDialog";
import {
  AppDialogFooterTriple,
  AppDialogFooterPair,
} from "./components/AppDialogFooter";
import { AppShell } from "./components/AppShell";
import { ResultsView } from "./components/ResultsView";
import { SetupView } from "./components/SetupView";
import { SimpleModeView } from "./components/SimpleModeView";
import { StartupBlockingOverlay } from "./components/StartupBlockingOverlay";
import { parseViewCommand, useAppCommands } from "./hooks/useAppCommands";
import { useProjectDraft } from "./hooks/useProjectDraft";
import { isProjectConfigured } from "./lib/simpleMode";
import { projectDraftPartial } from "./lib/projectDirty";
import { defaultProjectFileName } from "./lib/projectFile";
import { progressFromLogs } from "./lib/progressFromLogs";
import { resolveStartupBlockingMode } from "./lib/startupOverlay";
import { UI_COPY } from "./lib/uiCopy";
import { useProjects } from "./hooks/useProjects";
import { useStreamLogs } from "./hooks/useStreamLogs";
import { useTheme } from "./hooks/useTheme";
import type {
  AppView,
  RepoSnapshot,
  ToolchainReport,
} from "./types";

const LS_OUTPUT = "hg-to-git-output-panel";

function loadOutputPrefs(): { open: boolean; height: number } {
  try {
    const raw = localStorage.getItem(LS_OUTPUT);
    if (raw) return JSON.parse(raw);
  } catch {
    /* */
  }
  return { open: true, height: 220 };
}


type PendingNav =
  | { type: "exit" }
  | { type: "open"; projectId: string }
  | { type: "new" }
  | { type: "load"; filePath: string };

type ExitDialog = "convert-warning" | "unsaved" | null;

export default function App() {
  const {
    state: projectsState,
    loading,
    activeProject,
    updateProject,
    newProject,
    switchProject,
    removeProject,
    loadProjectFromFile,
    writeProjectToFile,
    syncMenuState,
    error: projectError,
    setError: setProjectError,
  } = useProjects();

  const { setTheme, toggle: toggleTheme } = useTheme();
  const [, startUiTransition] = useTransition();
  const { logs, appendLog, appendError, clearLogs } = useStreamLogs();
  const [view, setView] = useState<AppView>("setup");
  const [outputPrefs, setOutputPrefs] = useState(loadOutputPrefs);
  const [snapshot, setSnapshot] = useState<RepoSnapshot | null>(null);
  const [snapshotRefreshing, setSnapshotRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const [runStatus, setRunStatus] = useState<
    "idle" | "running" | "success" | "error"
  >("idle");
  const [runNotice, setRunNotice] = useState<string | null>(null);
  const [resultMeta, setResultMeta] = useState<{
    revisionsImported?: number;
    incremental?: boolean;
  }>({});
  const [toolchain, setToolchain] = useState<ToolchainReport | null>(null);
  const [toolchainLoading, setToolchainLoading] = useState(true);
  const [projectLoadPending, setProjectLoadPending] = useState(false);
  const [snapshotLoadDetail, setSnapshotLoadDetail] = useState<string | null>(
    null,
  );
  const projectLoadGen = useRef(0);
  const loadedProjectId = useRef<string | null>(null);
  const convertAbortRef = useRef<(() => void) | null>(null);
  const [exitDialog, setExitDialog] = useState<ExitDialog>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingNav, setPendingNav] = useState<PendingNav | null>(null);

  const { draft, patchDraft, isDirty, setDraft } = useProjectDraft(activeProject);
  const project = draft;

  useEffect(() => {
    fetchToolchain()
      .then(setToolchain)
      .catch(() =>
        setToolchain({
          ok: false,
          platform: "unknown",
          canAutoInstall: false,
          tools: [],
        }),
      )
      .finally(() => setToolchainLoading(false));
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_OUTPUT, JSON.stringify(outputPrefs));
  }, [outputPrefs]);

  const projectConfigured = isProjectConfigured(project);
  const simpleModeActive =
    Boolean(project?.simpleMode) && projectConfigured;

  const menuRestricted =
    toolchainLoading ||
    (toolchain !== null && !toolchain.ok) ||
    loading ||
    projectLoadPending;

  const startupBlockingMode = useMemo(
    () =>
      resolveStartupBlockingMode({
        toolchainLoading,
        toolchain,
        projectsLoading: loading,
        projectLoadPending,
        projectName: project?.name,
        projectLoadDetail: snapshotLoadDetail ?? undefined,
      }),
    [
      toolchainLoading,
      toolchain,
      loading,
      projectLoadPending,
      project?.name,
      snapshotLoadDetail,
    ],
  );

  const blockingOverlay = (
    <StartupBlockingOverlay
      mode={startupBlockingMode}
      onDepsReady={(report) => setToolchain(report)}
    />
  );

  useEffect(() => {
    if (!loading && project?.simpleMode && !projectConfigured) {
      void updateProject({ simpleMode: false });
    }
  }, [loading, project?.simpleMode, projectConfigured, updateProject]);

  useEffect(() => {
    if (!loading && projectsState) {
      syncMenuState(view, {
        simpleMode: simpleModeActive,
        projectConfigured,
        menuRestricted,
      });
    }
  }, [
    loading,
    projectsState,
    view,
    syncMenuState,
    simpleModeActive,
    projectConfigured,
    menuRestricted,
  ]);

  useEffect(() => {
    document.title = project?.name
      ? `${project.name} — hg-to-git`
      : "hg-to-git";
  }, [project?.name]);

  const saveDraft = useCallback(async () => {
    if (!draft) return;
    await updateProject(projectDraftPartial(draft));
  }, [draft, updateProject]);

  const resetWorkspaceUi = useCallback(() => {
    projectLoadGen.current += 1;
    loadedProjectId.current = null;
    convertAbortRef.current?.();
    convertAbortRef.current = null;
    clearLogs();
    setSnapshot(null);
    setSnapshotRefreshing(false);
    setSnapshotLoadDetail(null);
    setRunning(false);
    setRunStatus("idle");
    setRunNotice(null);
    setResultMeta({});
    setView("setup");
  }, [clearLogs]);

  const discardDraft = useCallback(() => {
    if (activeProject) setDraft({ ...activeProject });
  }, [activeProject, setDraft]);

  const persistProjectFile = useCallback(
    async (saveAs: boolean) => {
      if (!draft?.id) return;
      const partial = projectDraftPartial(draft);
      await updateProject(partial);

      let filePath = draft.projectFile;
      if (saveAs || !filePath) {
        const picked = await pickSavePath({
          title: saveAs ? "Save Project As" : "Save Project",
          defaultPath:
            filePath ||
            draft.projectFile ||
            draft.gitRepo ||
            draft.hgRepo ||
            undefined,
          suggestedName: defaultProjectFileName(draft.name),
          fileFilter: "project",
        });
        if (picked.cancelled || !picked.path) return;
        if (picked.error) throw new Error(picked.error);
        filePath = picked.path;
      }

      await writeProjectToFile(draft.id, filePath);
    },
    [draft, updateProject, writeProjectToFile],
  );

  const finishQuit = useCallback(() => {
    convertAbortRef.current?.();
    convertAbortRef.current = null;
    setRunning(false);
    setRunStatus("idle");
    confirmAppQuit();
  }, []);

  const runPendingNav = useCallback(
    async (action: PendingNav, saved: boolean) => {
      if (saved) await saveDraft();
      else discardDraft();

      if (action.type === "exit") {
        finishQuit();
        return;
      }
      if (action.type === "new") {
        resetWorkspaceUi();
        await newProject();
        return;
      }
      if (action.type === "open") {
        resetWorkspaceUi();
        await switchProject(action.projectId);
        return;
      }
      if (action.type === "load") {
        resetWorkspaceUi();
        await loadProjectFromFile(action.filePath);
      }
    },
    [
      discardDraft,
      finishQuit,
      loadProjectFromFile,
      newProject,
      resetWorkspaceUi,
      saveDraft,
      switchProject,
    ],
  );

  const beginExitFlow = useCallback(
    (action: PendingNav) => {
      setPendingNav(action);
      if (running) {
        setExitDialog("convert-warning");
        return;
      }
      if (isDirty) {
        setExitDialog("unsaved");
        return;
      }
      void runPendingNav(action, false);
    },
    [isDirty, runPendingNav, running],
  );

  const requestExit = useCallback(() => {
    beginExitFlow({ type: "exit" });
  }, [beginExitFlow]);

  useEffect(() => subscribeRequestExit(requestExit), [requestExit]);

  const refreshSnapshot = useCallback(
    async (options?: { overlay?: boolean }) => {
      if (!activeProject?.hgRepo || !activeProject?.gitRepo) return;
      const useOverlay = options?.overlay === true;
      if (useOverlay) setProjectLoadPending(true);
      setSnapshotLoadDetail(UI_COPY.refreshingStatusDetail);
      setSnapshotRefreshing(true);
      try {
        const snap = await fetchSnapshot(
          activeProject.hgRepo,
          activeProject.gitRepo,
          {
            defaultBranch: activeProject.defaultBranch ?? "master",
            onProgress: (detail) => setSnapshotLoadDetail(detail),
          },
        );
        startUiTransition(() => setSnapshot(snap));
      } catch {
        startUiTransition(() => setSnapshot(null));
      } finally {
        setSnapshotRefreshing(false);
        setSnapshotLoadDetail(null);
        if (useOverlay) setProjectLoadPending(false);
      }
    },
    [
      activeProject?.hgRepo,
      activeProject?.gitRepo,
      activeProject?.defaultBranch,
      startUiTransition,
    ],
  );

  const refreshSnapshotWithOverlay = useCallback(() => {
    void refreshSnapshot({ overlay: true });
  }, [refreshSnapshot]);

  useEffect(() => {
    if (toolchainLoading || !toolchain?.ok || loading) return;

    const projectId = activeProject?.id;
    const hgRepo = activeProject?.hgRepo?.trim();
    const gitRepo = activeProject?.gitRepo?.trim();

    if (!projectId || !hgRepo || !gitRepo) {
      setProjectLoadPending(false);
      loadedProjectId.current = null;
      if (!projectId) startUiTransition(() => setSnapshot(null));
      return;
    }

    const isNewProject = loadedProjectId.current !== projectId;
    if (isNewProject) loadedProjectId.current = projectId;

    const gen = ++projectLoadGen.current;
    if (isNewProject) setProjectLoadPending(true);
    setSnapshotLoadDetail(UI_COPY.refreshingStatusDetail);
    setSnapshotRefreshing(true);

    let cancelled = false;
    (async () => {
      try {
        const snap = await fetchSnapshot(hgRepo, gitRepo, {
          defaultBranch: activeProject.defaultBranch ?? "master",
          onProgress: (detail) => {
            if (!cancelled) setSnapshotLoadDetail(detail);
          },
        });
        if (!cancelled && projectLoadGen.current === gen) {
          startUiTransition(() => setSnapshot(snap));
        }
      } catch {
        if (!cancelled && projectLoadGen.current === gen) {
          startUiTransition(() => setSnapshot(null));
        }
      } finally {
        if (!cancelled && projectLoadGen.current === gen) {
          setSnapshotRefreshing(false);
          setSnapshotLoadDetail(null);
          if (isNewProject) setProjectLoadPending(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    toolchainLoading,
    toolchain?.ok,
    loading,
    activeProject?.id,
    activeProject?.hgRepo,
    activeProject?.gitRepo,
    activeProject?.defaultBranch,
    startUiTransition,
  ]);

  const progress = useMemo(() => progressFromLogs(logs), [logs]);

  const handleConvert = useCallback(
    (options?: { force?: boolean }) => {
    if (!project?.hgRepo || !project?.gitRepo || running) return;

    if (snapshot?.git.ignoreCaseProblematic && !options?.force) {
      setRunNotice(
        "Git core.ignoreCase is true — use Fix automatically or Run with force.",
      );
      setView("results");
      return;
    }

    if (snapshot?.git.targetProblematic && !options?.force) {
      setRunNotice(
        "Git target has existing branches — reset the target or Run with force.",
      );
      setView("results");
      return;
    }

    if (snapshot?.sync.repoPathMismatch) {
      setRunNotice(
        "Hg path in conversion state does not match this project — fix paths or reset Git target.",
      );
      setView("results");
      return;
    }

    if (
      snapshot?.hg.valid &&
      snapshot?.git.valid &&
      snapshot.sync.status === "in_sync" &&
      !options?.force
    ) {
      setRunNotice(UI_COPY.repositoriesInSync);
      setView("results");
      return;
    }

    setRunNotice(null);
    clearLogs();
    setRunning(true);
    setRunStatus("running");
    setResultMeta({});
    if (!project.simpleMode) {
      setOutputPrefs((p) => ({ ...p, open: true }));
      setView("results");
    }

    convertAbortRef.current = runConvert(
      {
        hgRepo: project.hgRepo,
        gitRepo: project.gitRepo,
        defaultBranch: project.defaultBranch ?? "master",
        checkoutWorkingTree: project.checkoutWorkingTree,
        hgTags: true,
        repackAfterImport: true,
        ignoreUnnamedHeads: true,
        force: options?.force ?? false,
      },
      {
        onLog: appendLog,
        onSnapshotProgress: (detail) => {
          setProjectLoadPending(true);
          setSnapshotLoadDetail(detail);
        },
        onDone: async (data) => {
          setRunning(false);
          setRunStatus("success");
          setProjectLoadPending(false);
          setSnapshotLoadDetail(null);
          const result = data.result as {
            revisionsImported?: number;
            incremental?: boolean;
          };
          startUiTransition(() => {
            setResultMeta({
              revisionsImported: result.revisionsImported,
              incremental: result.incremental,
            });
            setSnapshot(data.snapshot);
          });
          await updateProject({ lastRunStatus: "success" });
        },
        onError: async (msg) => {
          setRunning(false);
          setProjectLoadPending(false);
          setSnapshotLoadDetail(null);
          setRunStatus("error");
          appendError(msg);
          await updateProject({ lastRunStatus: "error" });
        },
      },
    );
  },
    [
      project,
      running,
      snapshot?.git.ignoreCaseProblematic,
      snapshot?.git.targetProblematic,
      updateProject,
      clearLogs,
      appendLog,
      appendError,
      startUiTransition,
    ],
  );

  const handleMenuCommand = useCallback(
    async (command: string, payload?: unknown) => {
      setProjectError(null);
      if ((menuRestricted || running) && command !== "file:exit") return;

      if (command === "file:exit") {
        beginExitFlow({ type: "exit" });
        return;
      }

      const viewCmd = parseViewCommand(command);
      if (viewCmd) {
        if (project?.simpleMode) {
          patchDraft({ simpleMode: false });
        }
        setView(viewCmd);
        return;
      }
      try {
        switch (command) {
        case "file:new-project":
          if (isDirty) {
            beginExitFlow({ type: "new" });
            break;
          }
          resetWorkspaceUi();
          await newProject();
          break;
        case "file:open-project": {
          const id = (payload as { projectId?: string })?.projectId;
          if (!id || id === activeProject?.id) break;
          if (isDirty) {
            beginExitFlow({ type: "open", projectId: id });
            break;
          }
          resetWorkspaceUi();
          await switchProject(id);
          break;
        }
        case "file:load-project": {
          const picked = await pickPath({
            kind: "file",
            title: "Load Project",
            fileFilter: "project",
          });
          if (picked.cancelled || !picked.path) break;
          if (picked.error) throw new Error(picked.error);
          if (isDirty) {
            beginExitFlow({ type: "load", filePath: picked.path });
            break;
          }
          resetWorkspaceUi();
          await loadProjectFromFile(picked.path);
          break;
        }
        case "file:save-project":
          await persistProjectFile(false);
          break;
        case "file:save-project-as":
          await persistProjectFile(true);
          break;
        case "file:delete-project":
          if (!activeProject?.id) break;
          setDeleteDialogOpen(true);
          break;
        case "view:toggle-output":
          if (!project?.simpleMode) {
            setOutputPrefs((p) => ({ ...p, open: !p.open }));
          }
          break;
        case "view:toggle-theme":
          toggleTheme();
          break;
        case "view:theme-light":
          setTheme("light");
          break;
        case "view:theme-dark":
          setTheme("dark");
          break;
        case "view:toggle-simple-mode": {
          if (!project || !projectConfigured) {
            setProjectError(
              "Configure Mercurial and Git paths before using Simple Mode.",
            );
            break;
          }
          const next = !project.simpleMode;
          patchDraft({ simpleMode: next });
          if (!next) setView("setup");
          break;
        }
        case "run:convert":
          setView("results");
          handleConvert();
          break;
        }
      } catch (e) {
        setProjectError(String(e));
      }
    },
    [
      activeProject?.id,
      beginExitFlow,
      handleConvert,
      isDirty,
      loadProjectFromFile,
      menuRestricted,
      newProject,
      patchDraft,
      persistProjectFile,
      project,
      projectConfigured,
      resetWorkspaceUi,
      setProjectError,
      setTheme,
      switchProject,
      toggleTheme,
    ],
  );

  const handleDeleteProject = useCallback(async () => {
    if (!activeProject?.id) return;
    setDeleteDialogOpen(false);
    discardDraft();
    resetWorkspaceUi();
    await removeProject(activeProject.id);
  }, [activeProject?.id, discardDraft, removeProject, resetWorkspaceUi]);

  useAppCommands(({ command, payload }) => {
    void handleMenuCommand(command, payload);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (menuRestricted) return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "1") {
          e.preventDefault();
          setView("setup");
        } else if (e.key === "2") {
          e.preventDefault();
          setView("results");
        } else if (e.key === "`") {
          if (!project?.simpleMode) {
            e.preventDefault();
            setOutputPrefs((p) => ({ ...p, open: !p.open }));
          }
        } else if (running) {
          return;
        } else if (e.key === "n") {
          e.preventDefault();
          void handleMenuCommand("file:new-project");
        } else if (e.key === "s") {
          e.preventDefault();
          void persistProjectFile(false);
        } else if (
          e.key === "Enter" &&
          (view === "results" || simpleModeActive)
        ) {
          e.preventDefault();
          handleConvert();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    handleConvert,
    handleMenuCommand,
    menuRestricted,
    project,
    running,
    persistProjectFile,
    simpleModeActive,
    view,
  ]);

  const appDialogs = (
    <>
      <AppDialog
        open={exitDialog === "unsaved"}
        title={UI_COPY.saveChangesTitle}
        description={UI_COPY.saveChangesDetail}
        size="lg"
        footer={
          <AppDialogFooterTriple
            cancel={{
              label: UI_COPY.cancel,
              onClick: () => {
                setExitDialog(null);
                setPendingNav(null);
              },
            }}
            secondary={{
              label: UI_COPY.dontSave,
              onClick: () => {
                const action = pendingNav;
                setExitDialog(null);
                setPendingNav(null);
                if (action) void runPendingNav(action, false);
              },
            }}
            primary={{
              label: UI_COPY.save,
              onClick: () => {
                const action = pendingNav;
                setExitDialog(null);
                setPendingNav(null);
                if (action) void runPendingNav(action, true);
              },
            }}
          />
        }
      />
      <AppDialog
        open={exitDialog === "convert-warning"}
        title={UI_COPY.quitDuringConvertTitle}
        description={UI_COPY.quitDuringConvertDetail}
        tone="warning"
        footer={
          <AppDialogFooterPair
            cancel={{
              label: UI_COPY.cancel,
              onClick: () => {
                setExitDialog(null);
                setPendingNav(null);
              },
            }}
            confirm={{
              label: UI_COPY.quitAnyway,
              variant: "destructive",
              onClick: () => {
                setExitDialog(null);
                setPendingNav(null);
                finishQuit();
              },
            }}
          />
        }
      />
      <AppDialog
        open={deleteDialogOpen}
        title={UI_COPY.deleteProjectTitle}
        description={
          project?.name
            ? UI_COPY.deleteProjectDetail(project.name)
            : undefined
        }
        tone="destructive"
        footer={
          <AppDialogFooterPair
            cancel={{
              label: UI_COPY.cancel,
              onClick: () => setDeleteDialogOpen(false),
            }}
            confirm={{
              label: UI_COPY.delete,
              variant: "destructive",
              onClick: () => void handleDeleteProject(),
            }}
          />
        }
      />
    </>
  );

  const displayProgress =
    running && progress.percent > 0
      ? progress
      : runStatus === "success"
        ? { percent: 100, label: progress.label || "Complete" }
        : { percent: 0, label: progress.label };

  const exitSimpleMode = () => {
    patchDraft({ simpleMode: false });
    setView("setup");
  };

  if (simpleModeActive && project) {
    return (
      <AppShell
        simpleMode
        blockingOverlay={blockingOverlay}
        view={view}
        projectsState={projectsState}
        activeProject={project}
        menuRestricted={menuRestricted}
        appDialogs={appDialogs}
        outputOpen={outputPrefs.open}
        outputHeight={outputPrefs.height}
        logs={logs}
        running={running}
        onViewChange={setView}
        onMenuCommand={(cmd, payload) => void handleMenuCommand(cmd, payload)}
        onOutputToggle={() =>
          setOutputPrefs((p) => ({ ...p, open: !p.open }))
        }
        onOutputHeightChange={(height) =>
          setOutputPrefs((p) => ({ ...p, height }))
        }
        onClearLogs={clearLogs}
        canRun={projectConfigured}
      >
        <SimpleModeView
          project={project}
          snapshot={snapshot}
          snapshotRefreshing={snapshotRefreshing}
          running={running}
          runStatus={runStatus}
          percent={displayProgress.percent}
          progressLabel={displayProgress.label}
          revisionsImported={resultMeta.revisionsImported}
          onSync={() => handleConvert()}
          onRefresh={refreshSnapshotWithOverlay}
          onExitSimpleMode={exitSimpleMode}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      blockingOverlay={blockingOverlay}
      view={view}
      projectsState={projectsState}
      activeProject={project}
      menuRestricted={menuRestricted}
      appDialogs={appDialogs}
      outputOpen={outputPrefs.open}
      outputHeight={outputPrefs.height}
      logs={logs}
      running={running}
      onViewChange={setView}
      onMenuCommand={(cmd, payload) => void handleMenuCommand(cmd, payload)}
      onOutputToggle={() =>
        setOutputPrefs((p) => ({ ...p, open: !p.open }))
      }
      onOutputHeightChange={(height) =>
        setOutputPrefs((p) => ({ ...p, height }))
      }
      onClearLogs={clearLogs}
      projectError={projectError}
      canRun={projectConfigured}
      snapshot={snapshot}
      runNotice={runNotice}
      snapshotRefreshing={snapshotRefreshing}
      onUpdateProject={(partial) => patchDraft(partial)}
      onConvert={() => handleConvert()}
      onRefreshSnapshot={refreshSnapshotWithOverlay}
    >
      {view === "setup" ? (
        <SetupView
          project={project}
          snapshot={snapshot}
          onUpdate={(partial) => patchDraft(partial)}
          onRefresh={() => void refreshSnapshot()}
          onNewProject={() => void newProject()}
          onForceConvert={() => handleConvert({ force: true })}
          running={running}
        />
      ) : (
        <ResultsView
          project={project}
          snapshot={snapshot}
          percent={displayProgress.percent}
          progressLabel={displayProgress.label}
          running={running}
          runStatus={runStatus}
          revisionsImported={resultMeta.revisionsImported}
          incremental={resultMeta.incremental}
        />
      )}
    </AppShell>
  );
}
