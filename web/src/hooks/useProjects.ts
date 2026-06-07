import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createProject,
  deleteProject,
  fetchProjects,
  importProjectFromFile,
  openProject,
  saveProject,
  saveProjectToFile,
  syncMenu,
} from "../api";
import type { AppView, Project, ProjectsState } from "../types";

export function useProjects() {
  const [state, setState] = useState<ProjectsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const next = await fetchProjects();
    setState(next);
    return next;
  }, []);

  useEffect(() => {
    reload()
      .catch(() =>
        setState({ version: 1, lastProjectId: null, projects: [] }),
      )
      .finally(() => setLoading(false));
  }, [reload]);

  const activeProject = useMemo(() => {
    if (!state?.lastProjectId) return null;
    return state.projects.find((p) => p.id === state.lastProjectId) ?? null;
  }, [state]);

  const syncMenuState = useCallback(
    (
      view: AppView,
      extras?: {
        simpleMode?: boolean;
        projectConfigured?: boolean;
        menuRestricted?: boolean;
      },
    ) => {
      if (!state) return;
      void syncMenu({
        projects: state.projects,
        recentProjectIds: state.recentProjectIds,
        activeProjectId: state.lastProjectId,
        view,
        simpleMode: extras?.simpleMode,
        projectConfigured: extras?.projectConfigured,
        menuRestricted: extras?.menuRestricted,
      });
    },
    [state],
  );

  const updateProject = useCallback(
    async (partial: Partial<Project>) => {
      if (!activeProject) return;
      const { state: next, project } = await saveProject(activeProject.id, partial);
      setState(next);
      return project;
    },
    [activeProject],
  );

  const newProject = useCallback(async () => {
    setError(null);
    try {
      const result = await createProject();
      const next = result.state;
      if (!next?.lastProjectId) {
        throw new Error("Project was not activated after create");
      }
      setState(next);
      return next;
    } catch (e) {
      const msg = String(e);
      setError(msg);
      throw e;
    }
  }, []);

  const switchProject = useCallback(async (id: string) => {
    const next = await openProject(id);
    setState(next);
    return next;
  }, []);

  const removeProject = useCallback(
    async (id: string) => {
      const next = await deleteProject(id);
      setState(next);
      return next;
    },
    [],
  );

  const loadProjectFromFile = useCallback(async (filePath: string) => {
    const result = await importProjectFromFile(filePath);
    setState(result.state);
    return result.project;
  }, []);

  const writeProjectToFile = useCallback(
    async (id: string, filePath: string, partial?: Partial<Project>) => {
      const result = await saveProjectToFile(id, filePath, partial);
      setState(result.state);
      return result.project;
    },
    [],
  );

  return {
    state,
    loading,
    error,
    setError,
    activeProject,
    reload,
    updateProject,
    newProject,
    switchProject,
    removeProject,
    loadProjectFromFile,
    writeProjectToFile,
    syncMenuState,
  };
}
