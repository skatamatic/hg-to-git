import type { ReactNode } from "react";
import { cn } from "../lib/utils";

interface Props {
  children: ReactNode;
  className?: string;
  zIndex?: "overlay" | "dialog";
}

/** Dimmed backdrop below the menu bar (menu stays visible). */
export function BlockingScrim({
  children,
  className,
  zIndex = "overlay",
}: Props) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 flex items-center justify-center p-6",
        "top-[var(--menubar-height)] bg-background/55 backdrop-blur-[3px]",
        zIndex === "dialog"
          ? "z-[var(--z-app-dialog)]"
          : "z-[var(--z-blocking-overlay)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
