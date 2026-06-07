import { AlertTriangle, CircleHelp, Trash2, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "../lib/utils";
import { BlockingScrim } from "./BlockingScrim";
import { AppModalCard } from "./AppModalCard";

export type AppDialogTone = "default" | "warning" | "destructive";

const toneMeta: Record<
  AppDialogTone,
  { icon: LucideIcon; iconWrap: string; iconColor: string }
> = {
  default: {
    icon: CircleHelp,
    iconWrap: "bg-accent/10",
    iconColor: "text-accent",
  },
  warning: {
    icon: AlertTriangle,
    iconWrap: "bg-warning/12",
    iconColor: "text-warning",
  },
  destructive: {
    icon: Trash2,
    iconWrap: "bg-destructive/10",
    iconColor: "text-destructive",
  },
};

interface Props {
  open: boolean;
  title: string;
  description?: string;
  tone?: AppDialogTone;
  /** Wider card for three-button footers. */
  size?: "md" | "lg";
  footer: ReactNode;
}

export function AppDialog({
  open,
  title,
  description,
  tone = "default",
  size = "md",
  footer,
}: Props) {
  const [visible, setVisible] = useState(open);
  const [closing, setClosing] = useState(false);
  const { icon: Icon, iconWrap, iconColor } = toneMeta[tone];

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
    <BlockingScrim zIndex="dialog" variant="dialog">
      <div
        className={cn(
          "w-full",
          size === "lg" ? "max-w-[min(100%,30rem)]" : "max-w-[min(100%,26rem)]",
          "motion-safe:transition-[opacity,transform] motion-safe:duration-180 motion-safe:ease-out",
          closing ? "scale-[0.98] opacity-0" : "scale-100 opacity-100",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby={description ? "app-dialog-description" : undefined}
      >
        <AppModalCard variant="dialog" footer={footer}>
          <div className="flex gap-4">
            <div
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full",
                iconWrap,
              )}
              aria-hidden
            >
              <Icon className={cn("size-[1.125rem]", iconColor)} strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1 pt-0.5 text-left">
              <h2
                id="app-dialog-title"
                className="text-[length:var(--text-ui-lg)] font-semibold leading-snug text-foreground"
              >
                {title}
              </h2>
              {description ? (
                <p
                  id="app-dialog-description"
                  className="mt-2 text-[length:var(--text-ui-base)] leading-relaxed text-muted-foreground"
                >
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        </AppModalCard>
      </div>
    </BlockingScrim>
  );
}
