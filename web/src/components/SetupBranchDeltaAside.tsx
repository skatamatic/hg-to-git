import { useCallback, useEffect, useRef, useState } from "react";
import type { RepoSnapshot } from "../types";
import { BranchDeltaList } from "./BranchDeltaList";
import { cn } from "../lib/utils";

const LS_WIDTH = "hg-to-git-branch-delta-width";
const MIN_WIDTH = 260;
const DEFAULT_WIDTH = Math.round(320 * 1.4); // 40% wider than previous 320px max
const MAX_WIDTH_RATIO = 0.5;

function readStoredWidth(): number {
  try {
    const raw = localStorage.getItem(LS_WIDTH);
    if (!raw) return DEFAULT_WIDTH;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return DEFAULT_WIDTH;
    return Math.max(MIN_WIDTH, n);
  } catch {
    return DEFAULT_WIDTH;
  }
}

interface Props {
  snapshot: RepoSnapshot | null;
}

export function SetupBranchDeltaAside({ snapshot }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(readStoredWidth);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    localStorage.setItem(LS_WIDTH, String(width));
  }, [width]);

  const clampWidth = useCallback((next: number) => {
    const split =
      containerRef.current?.parentElement?.offsetWidth ?? window.innerWidth;
    const maxW = Math.max(MIN_WIDTH, Math.floor(split * MAX_WIDTH_RATIO));
    return Math.min(Math.max(MIN_WIDTH, next), maxW);
  }, []);

  useEffect(() => {
    setWidth((w) => clampWidth(w));
  }, [clampWidth]);

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startW: width };
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = dragRef.current.startX - ev.clientX;
        setWidth(clampWidth(dragRef.current.startW + delta));
      };
      const onUp = () => {
        dragRef.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [width, clampWidth],
  );

  return (
    <div
      ref={containerRef}
      className="hidden min-h-0 min-w-0 lg:flex lg:shrink-0"
      style={{ width }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={MIN_WIDTH}
        aria-label="Resize branch delta panel"
        onMouseDown={onResizeStart}
        className={cn(
          "group -ml-1.5 flex w-3 shrink-0 cursor-col-resize items-stretch justify-center",
          "hover:bg-accent/10",
        )}
      >
        <span
          className={cn(
            "my-2 w-0.5 rounded-full bg-border transition-colors",
            "group-hover:bg-accent/50 group-active:bg-accent",
          )}
        />
      </div>

      <aside className="surface-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-border/50 px-3 py-1.5">
          <h3 className="text-ui-label">Branch delta</h3>
        </header>
        <div className="scrollbar-themed min-h-0 flex-1 overflow-y-auto">
          <BranchDeltaList snapshot={snapshot} sidebar />
        </div>
        {snapshot && snapshot.sync.pendingChangesets.length > 0 && (
          <>
            <header className="shrink-0 border-y border-border/50 px-3 py-1.5">
              <h3 className="text-ui-label text-git">
                Pending ({snapshot.sync.pendingChangesets.length})
              </h3>
            </header>
            <ul className="scrollbar-themed max-h-[28%] shrink-0 divide-y divide-border/40 overflow-y-auto">
              {snapshot.sync.pendingChangesets.map((cs) => (
                <li key={cs.rev} className="px-3 py-1.5 text-ui-caption">
                  <span className="text-ui-mono font-medium text-hg">
                    r{cs.rev}
                  </span>
                  <span className="mx-1.5 text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{cs.branch}</span>
                  <p className="truncate text-foreground/90">
                    {cs.summary || "(no message)"}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}

/** Stacked branch delta for narrow viewports (no resize). */
export function SetupBranchDeltaAsideMobile({ snapshot }: Props) {
  return (
    <aside className="surface-panel flex min-h-0 flex-col overflow-hidden lg:hidden">
      <header className="shrink-0 border-b border-border/50 px-3 py-1.5">
        <h3 className="text-ui-label">Branch delta</h3>
      </header>
      <div className="scrollbar-themed max-h-[min(40vh,320px)] overflow-y-auto">
        <BranchDeltaList snapshot={snapshot} sidebar />
      </div>
    </aside>
  );
}
