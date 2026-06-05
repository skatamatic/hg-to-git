import { isElectron } from "../api";

export function BrowserModeBanner() {
  if (isElectron()) return null;

  return (
    <footer
      className="text-ui-caption flex shrink-0 items-center justify-center border-t border-border/50 bg-muted/30 px-4 py-1"
      role="status"
    >
      Browser preview mode
    </footer>
  );
}
