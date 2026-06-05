import { useEffect, useState } from "react";
import { cn } from "../lib/utils";
import { BlockingScrim } from "./BlockingScrim";
import { AppModalCard } from "./AppModalCard";

export interface ProjectLoadOverlayProps {
  open: boolean;
  title: string;
  subtitle?: string;
  ariaLabel?: string;
}

export function ProjectLoadOverlay({
  open,
  title,
  subtitle,
  ariaLabel,
}: ProjectLoadOverlayProps) {
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

  if (!visible) return null;

  return (
    <BlockingScrim
      className={cn(
        "motion-safe:transition-opacity motion-safe:duration-180",
        closing ? "opacity-0" : "opacity-100",
      )}
    >
      <div
        className={cn(
          "motion-safe:transition-[opacity,transform] motion-safe:duration-180 motion-safe:ease-out",
          closing ? "scale-[0.98] opacity-0" : "scale-100 opacity-100",
        )}
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={ariaLabel ?? title}
      >
        <AppModalCard>
          <div className="flex flex-col items-center gap-4">
            <div
              className="size-9 animate-spin rounded-full border-2 border-border border-t-accent"
              aria-hidden
            />
            <div className="space-y-1">
              <p className="text-ui-title">{title}</p>
              {subtitle ? (
                <p className="text-ui-caption">{subtitle}</p>
              ) : null}
            </div>
          </div>
        </AppModalCard>
      </div>
    </BlockingScrim>
  );
}
