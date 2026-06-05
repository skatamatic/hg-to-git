import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import type { Project } from "../types";
import { AppMenuBar } from "./AppMenuBar";

interface Props {
  projects: Project[];
  activeProjectId: string | null;
  simpleMode?: boolean;
  projectConfigured?: boolean;
  menuRestricted?: boolean;
  onMenuCommand: (command: string, payload?: unknown) => void;
  children: ReactNode;
  overlay?: ReactNode;
  dialogs?: ReactNode;
}

/** Shell with menu bar; blocking overlays sit below the menu. */
export function AppChrome({
  projects,
  activeProjectId,
  simpleMode,
  projectConfigured,
  menuRestricted = false,
  onMenuCommand,
  children,
  overlay,
  dialogs,
}: Props) {
  return (
    <div className="relative flex h-screen max-h-screen flex-col overflow-hidden bg-panel">
      <AppMenuBar
        projects={projects}
        activeProjectId={activeProjectId}
        simpleMode={simpleMode}
        projectConfigured={projectConfigured}
        restricted={menuRestricted}
        onCommand={onMenuCommand}
      />
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          menuRestricted && "pointer-events-none select-none",
        )}
        aria-hidden={menuRestricted}
      >
        {children}
      </div>
      {overlay}
      {dialogs}
    </div>
  );
}
