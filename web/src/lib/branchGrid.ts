import { cn } from "./utils";

export function branchRowGridClass(compact?: boolean, sidebar?: boolean) {
  return cn(
    sidebar && compact
      ? "grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)_4.75rem] gap-x-1.5 gap-y-0"
      : compact
        ? "grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)_72px] gap-1"
        : "grid-cols-[minmax(0,1fr)_28px_minmax(0,1fr)_84px] gap-2",
  );
}

export function branchRowPaddingClass(compact?: boolean, sidebar?: boolean) {
  return sidebar && compact ? "px-2 py-1" : compact ? "px-2 py-1" : "px-3 py-1.5";
}
