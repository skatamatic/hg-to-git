import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useCallback, useRef } from "react";
import type { LogEntry } from "../types";
import { cn } from "../lib/utils";
import { LogPanel } from "./LogPanel";
import { Button } from "./ui/button";

interface Props {
  open: boolean;
  height: number;
  logs: LogEntry[];
  running: boolean;
  onToggle: () => void;
  onHeightChange: (h: number) => void;
  onClear: () => void;
}

export function OutputPanel({
  open,
  height,
  logs,
  running,
  onToggle,
  onHeightChange,
  onClear,
}: Props) {
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startH: height };
      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = dragRef.current.startY - ev.clientY;
        const next = Math.min(
          Math.max(120, dragRef.current.startH + delta),
          window.innerHeight * 0.65,
        );
        onHeightChange(next);
      };
      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [height, onHeightChange],
  );

  if (!open) {
    return (
      <footer className="workbench-chrome flex h-9 shrink-0 items-center justify-between border-t px-3">
        <button
          type="button"
          onClick={onToggle}
          className="text-ui-label flex items-center gap-2 hover:text-foreground"
        >
          <ChevronUp className="size-3.5" />
          Output
          {running && (
            <span className="relative ml-1 flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-accent" />
            </span>
          )}
          <span className="text-ui-mono tabular-nums text-muted-foreground/70">
            {logs.length} lines
          </span>
        </button>
      </footer>
    );
  }

  return (
    <footer
      className="workbench-chrome flex shrink-0 flex-col border-t"
      style={{ height }}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        onMouseDown={onResizeStart}
        className="group flex h-1.5 shrink-0 cursor-row-resize items-center justify-center bg-border/30 hover:bg-accent/40"
      >
        <span className="h-0.5 w-12 rounded-full bg-border group-hover:bg-accent/60" />
      </div>
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3">
        <button
          type="button"
          onClick={onToggle}
          className="text-ui-label flex items-center gap-2 text-foreground"
        >
          <ChevronDown className="size-3.5" />
          Output
        </button>
        <div className="flex items-center gap-1">
          <span className="text-ui-mono mr-2 tabular-nums text-muted-foreground">
            {logs.length} lines
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={onClear}
            disabled={logs.length === 0 || running}
          >
            <Trash2 className="size-3" />
            Clear
          </Button>
        </div>
      </div>
      <div className={cn("min-h-0 flex-1 overflow-hidden px-2 pb-2")}>
        <LogPanel logs={logs} running={running} embedded />
      </div>
    </footer>
  );
}
