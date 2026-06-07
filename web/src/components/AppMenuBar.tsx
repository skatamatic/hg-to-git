import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useInWindowMenuBar } from "../api";
import type { Project } from "../types";
import { getRecentProjects } from "../lib/recentProjects";
import { UI_COPY } from "../lib/uiCopy";
import { cn } from "../lib/utils";

interface Props {
  projects: Project[];
  recentProjectIds?: string[];
  activeProjectId: string | null;
  simpleMode?: boolean;
  projectConfigured?: boolean;
  /** Disable all items except Exit (startup overlay, loading, etc.). */
  restricted?: boolean;
  /** During sync: disable File/View items except Exit. */
  syncRunning?: boolean;
  onCommand: (command: string, payload?: unknown) => void;
}

function MenuDropdown({
  label,
  menuKey,
  openMenu,
  onOpenMenu,
  children,
}: {
  label: string;
  menuKey: string;
  openMenu: string | null;
  onOpenMenu: (key: string | null) => void;
  children: ReactNode;
}) {
  const menuId = useId();
  const open = openMenu === menuKey;

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => onOpenMenu(open ? null : menuKey)}
        onMouseEnter={() => {
          if (openMenu !== null) onOpenMenu(menuKey);
        }}
        className={cn(
          "rounded px-2.5 py-1 text-foreground/90 hover:bg-muted",
          open && "bg-muted text-foreground",
        )}
      >
        {label}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="workbench-menubar-dropdown absolute left-0 top-full min-w-[200px] pt-0.5"
        >
          <div className="rounded-md border border-border/60 bg-elevated py-1 shadow-lg">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

function Item({
  label,
  shortcut,
  onClick,
  disabled,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left hover:bg-muted disabled:opacity-40"
    >
      <span>{label}</span>
      {shortcut && (
        <span className="text-ui-mono text-muted-foreground">{shortcut}</span>
      )}
    </button>
  );
}

function Separator() {
  return <div role="separator" className="my-1 h-px bg-border/60" />;
}

function SubMenuItem({
  label,
  disabled,
  children,
}: {
  label: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => !disabled && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        className="flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left hover:bg-muted disabled:opacity-40"
      >
        <span>{label}</span>
        <span className="text-muted-foreground">›</span>
      </button>
      {open && (
        <div className="absolute left-full top-0 z-10 min-w-[200px] pl-0.5">
          <div className="rounded-md border border-border/60 bg-elevated py-1 shadow-lg">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

export function AppMenuBar({
  projects,
  recentProjectIds,
  activeProjectId,
  simpleMode,
  projectConfigured,
  restricted = false,
  syncRunning = false,
  onCommand,
}: Props) {
  const menuLocked = restricted || syncRunning;
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpenMenu(null), []);

  const run = useCallback(
    (command: string, payload?: unknown) => {
      close();
      onCommand(command, payload);
    },
    [close, onCommand],
  );

  useEffect(() => {
    if (!openMenu) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) {
        close();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu, close]);

  if (!useInWindowMenuBar()) return null;

  const recentProjects = getRecentProjects({
    version: 1,
    lastProjectId: activeProjectId,
    projects,
    recentProjectIds,
  });

  return (
    <div
      ref={barRef}
      className="workbench-chrome workbench-menubar flex h-[var(--menubar-height)] shrink-0 items-center gap-0.5 border-b px-2"
    >
      <MenuDropdown
        label="File"
        menuKey="file"
        openMenu={openMenu}
        onOpenMenu={setOpenMenu}
      >
        <Item
          label="New Project"
          shortcut="Ctrl+N"
          disabled={menuLocked}
          onClick={() => run("file:new-project")}
        />
        <Separator />
        <SubMenuItem label="Recent" disabled={menuLocked}>
          {recentProjects.length === 0 ? (
            <Item label="No recent projects" onClick={() => {}} disabled />
          ) : (
            recentProjects.map((p) => (
              <Item
                key={p.id}
                label={p.id === activeProjectId ? `${p.name} ✓` : p.name}
                disabled={menuLocked}
                onClick={() => run("file:open-project", { projectId: p.id })}
              />
            ))
          )}
        </SubMenuItem>
        <Item
          label="Load Project…"
          disabled={menuLocked}
          onClick={() => run("file:load-project")}
        />
        <Separator />
        <Item
          label="Save Project"
          shortcut="Ctrl+S"
          disabled={menuLocked || !activeProjectId}
          onClick={() => run("file:save-project")}
        />
        <Item
          label="Save Project As…"
          disabled={menuLocked || !activeProjectId}
          onClick={() => run("file:save-project-as")}
        />
        <Separator />
        <Item
          label={UI_COPY.exit}
          shortcut="Alt+F4"
          onClick={() => run("file:exit")}
        />
      </MenuDropdown>

      <MenuDropdown
        label="View"
        menuKey="view"
        openMenu={openMenu}
        onOpenMenu={setOpenMenu}
      >
        <Item
          label={simpleMode ? "Simple Mode ✓" : "Simple Mode"}
          onClick={() => run("view:toggle-simple-mode")}
          disabled={menuLocked || !projectConfigured}
        />
        <Separator />
        <Item
          label="Setup"
          shortcut="Ctrl+1"
          disabled={menuLocked}
          onClick={() => run("view:setup")}
        />
        <Item
          label="Run"
          shortcut="Ctrl+2"
          disabled={menuLocked}
          onClick={() => run("view:results")}
        />
        {!simpleMode && (
          <>
            <Separator />
            <Item
              label="Toggle Output"
              shortcut="Ctrl+`"
              disabled={menuLocked}
              onClick={() => run("view:toggle-output")}
            />
          </>
        )}
        <Item
          label="Toggle Theme"
          disabled={menuLocked}
          onClick={() => run("view:toggle-theme")}
        />
      </MenuDropdown>

    </div>
  );
}
