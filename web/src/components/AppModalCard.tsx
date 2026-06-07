import type { ReactNode } from "react";
import { cn } from "../lib/utils";

interface Props {
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  /** Centered loading/status cards vs. left-aligned confirmation dialogs. */
  variant?: "status" | "dialog";
}

export function AppModalCard({
  children,
  className,
  footer,
  variant = "status",
}: Props) {
  if (variant === "dialog") {
    return (
      <div
        className={cn(
          "app-dialog-card w-full overflow-hidden rounded-xl border border-border/80 bg-elevated text-foreground shadow-2xl",
          className,
        )}
      >
        <div className="px-6 pt-6 pb-5">{children}</div>
        {footer ? (
          <div className="border-t border-border/35 bg-muted/20 px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "surface-panel w-full max-w-[min(100%,22rem)] overflow-hidden text-center",
        className,
      )}
    >
      <div className="px-8 py-7">{children}</div>
      {footer ? (
        <div className="flex flex-col-reverse gap-2 border-t border-border/50 px-6 py-4 sm:flex-row sm:justify-end sm:text-left">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
