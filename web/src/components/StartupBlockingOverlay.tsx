import { useEffect, useState } from "react";
import type { ToolchainReport } from "../types";
import { cn } from "../lib/utils";
import { BlockingScrim } from "./BlockingScrim";
import { AppModalCard } from "./AppModalCard";
import { DependenciesSetup } from "./DependenciesSetup";

export type StartupBlockingMode =
  | { type: "loading"; title: string; subtitle?: string }
  | { type: "deps"; report: ToolchainReport };

interface Props {
  mode: StartupBlockingMode | null;
  onDepsReady: (report: ToolchainReport) => void;
}

function LoadingCard({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <AppModalCard>
      <div className="flex flex-col items-center gap-4">
        <div
          className="size-9 animate-spin rounded-full border-2 border-border border-t-accent"
          aria-hidden
        />
        <div className="space-y-1 text-center">
          <p className="text-ui-title">{title}</p>
          {subtitle ? (
            <p className="text-ui-caption text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
    </AppModalCard>
  );
}

export function StartupBlockingOverlay({ mode, onDepsReady }: Props) {
  const open = mode !== null;
  const [visible, setVisible] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setClosing(false);
      setVisible(true);
      return;
    }
    if (!visible) return;
    setClosing(true);
    const t = window.setTimeout(() => {
      setVisible(false);
      setClosing(false);
    }, 180);
    return () => window.clearTimeout(t);
  }, [open, visible]);

  if (!visible || !mode) return null;

  const busy = mode.type === "loading";

  return (
    <BlockingScrim
      zIndex="overlay"
      className={cn(
        "motion-safe:transition-opacity motion-safe:duration-180",
        closing ? "opacity-0" : "opacity-100",
      )}
    >
      <div
        className={cn(
          "w-full",
          mode.type === "deps"
            ? "max-w-[min(100%,32rem)]"
            : "max-w-[min(100%,20rem)]",
          "motion-safe:transition-[opacity,transform] motion-safe:duration-180 motion-safe:ease-out",
          closing ? "scale-[0.98] opacity-0" : "scale-100 opacity-100",
        )}
        role={busy ? "status" : "dialog"}
        aria-live={busy ? "polite" : undefined}
        aria-busy={busy}
        aria-modal={mode.type === "deps"}
        aria-label={
          mode.type === "loading"
            ? mode.title
            : "Set up conversion tools"
        }
      >
        {mode.type === "loading" ? (
          <LoadingCard title={mode.title} subtitle={mode.subtitle} />
        ) : (
          <DependenciesSetup
            variant="overlay"
            initial={mode.report}
            onReady={onDepsReady}
          />
        )}
      </div>
    </BlockingScrim>
  );
}
