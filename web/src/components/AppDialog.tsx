import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../lib/utils";
import { BlockingScrim } from "./BlockingScrim";
import { AppModalCard } from "./AppModalCard";

interface Props {
  open: boolean;
  title: string;
  description?: string;
  footer: ReactNode;
}

export function AppDialog({
  open,
  title,
  description,
  footer,
}: Props) {
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
    <BlockingScrim zIndex="dialog">
      <div
        className={cn(
          "w-full max-w-[min(100%,22rem)]",
          "motion-safe:transition-[opacity,transform] motion-safe:duration-180 motion-safe:ease-out",
          closing ? "scale-[0.98] opacity-0" : "scale-100 opacity-100",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
      >
        <AppModalCard
          footer={footer}
          className="text-left"
        >
          <h2 id="app-dialog-title" className="text-ui-title text-center">
            {title}
          </h2>
          {description ? (
            <p className="text-ui-caption mt-2 text-center">{description}</p>
          ) : null}
        </AppModalCard>
      </div>
    </BlockingScrim>
  );
}
