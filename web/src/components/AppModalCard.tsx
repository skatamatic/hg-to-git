import type { ReactNode } from "react";
import { cn } from "../lib/utils";

interface Props {
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
}

export function AppModalCard({ children, className, footer }: Props) {
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
