import { BarChart3, Settings2 } from "lucide-react";
import type { AppView } from "../types";
import { cn } from "../lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface Props {
  view: AppView;
  onViewChange: (view: AppView) => void;
  /** Block view switches during sync (use toolbar/output instead). */
  navLocked?: boolean;
}

const items: { id: AppView; label: string; icon: typeof Settings2 }[] = [
  { id: "setup", label: "Setup", icon: Settings2 },
  { id: "results", label: "Run", icon: BarChart3 },
];

export function ActivityBar({ view, onViewChange, navLocked }: Props) {
  return (
    <nav
      className="workbench-chrome flex w-[var(--activity-bar-width)] shrink-0 flex-col items-center border-r"
      aria-label="Views"
    >
      <div
        className="flex w-full flex-col items-center gap-0.5 pb-2"
        style={{ paddingTop: "calc((var(--toolbar-height) - 2rem) / 2)" }}
      >
        {items.map(({ id, label, icon: Icon }) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={label}
                aria-current={view === id ? "page" : undefined}
                disabled={navLocked}
                onClick={() => onViewChange(id)}
                className={cn(
                  "flex size-9 items-center justify-center rounded-md transition-colors",
                  view === id
                    ? "bg-accent/15 text-accent ring-1 ring-accent/30"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  navLocked && "cursor-not-allowed opacity-40 hover:bg-transparent",
                )}
              >
                <Icon className="size-3.5" strokeWidth={2} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </nav>
  );
}
