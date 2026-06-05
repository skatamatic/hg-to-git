import { useCallback, useEffect, useMemo, useState } from "react";
import type { Project } from "../types";
import { projectHasUnsavedChanges } from "../lib/projectDirty";

export function useProjectDraft(savedProject: Project | null) {
  const [draft, setDraft] = useState<Project | null>(null);

  useEffect(() => {
    setDraft(savedProject ? { ...savedProject } : null);
  }, [savedProject?.id, savedProject?.updatedAt]);

  const patchDraft = useCallback((partial: Partial<Project>) => {
    setDraft((prev) => (prev ? { ...prev, ...partial } : prev));
  }, []);

  const isDirty = useMemo(
    () => projectHasUnsavedChanges(draft, savedProject),
    [draft, savedProject],
  );

  return { draft, patchDraft, isDirty, setDraft };
}
