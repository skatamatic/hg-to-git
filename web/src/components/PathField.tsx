import type { LucideIcon } from "lucide-react";
import { FolderOpen, Loader2 } from "lucide-react";
import { useState } from "react";
import { pickPath } from "../api";
import { useInputsLocked } from "../lib/inputsLocked";
import { UI_COPY } from "../lib/uiCopy";
import { cn } from "../lib/utils";
import { Label } from "./ui/label";

interface Props {
  id: string;
  label: string;
  hint?: string;
  value: string;
  placeholder: string;
  icon: LucideIcon;
  accent: "hg" | "git" | "neutral";
  pickKind?: "directory" | "file";
  pickTitle?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  dense?: boolean;
}

export function PathField({
  id,
  label,
  hint,
  value,
  placeholder,
  icon: Icon,
  accent,
  pickKind = "directory",
  pickTitle,
  onChange,
  onBlur,
  dense,
}: Props) {
  const inputsLocked = useInputsLocked();
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const handleBrowse = async () => {
    if (inputsLocked) return;
    setPicking(true);
    setPickError(null);
    try {
      const { path, cancelled, error } = await pickPath({
        kind: pickKind,
        title: pickTitle ?? `Select ${label.toLowerCase()}`,
        defaultPath: value || undefined,
      });
      if (error) {
        setPickError(error);
        return;
      }
      if (!cancelled && path) {
        onChange(path);
        onBlur?.();
      }
    } catch (e) {
      setPickError(String(e));
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className={cn("space-y-1", dense && "space-y-0.5")}>
      <div className="flex items-center justify-between gap-2">
        <Label
          htmlFor={id}
          className={cn(
            dense ? "text-ui-label" : "text-foreground/90",
          )}
        >
          {label}
        </Label>
        {hint && (
          <span className="text-ui-mono text-muted-foreground">{hint}</span>
        )}
      </div>

      <div className="flex gap-1.5">
        <div
          className={cn(
            "surface-inset relative min-w-0 flex-1",
            "focus-within:border-border focus-within:ring-2 focus-within:ring-ring/20",
          )}
        >
          <Icon
            className={cn(
              "pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2",
              accent === "hg" && "text-hg/80",
              accent === "git" && "text-git/80",
              accent === "neutral" && "text-muted-foreground",
            )}
          />
          <input
            id={id}
            type="text"
            value={value}
            placeholder={placeholder}
            readOnly={inputsLocked}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            className={cn(
              "text-ui-mono w-full rounded-lg border-0 bg-transparent pl-8 pr-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none",
              dense ? "h-8" : "h-9",
              inputsLocked && "cursor-default opacity-80",
            )}
          />
        </div>

        <button
          type="button"
          onClick={handleBrowse}
          disabled={picking || inputsLocked}
          title={UI_COPY.browse(label)}
          className={cn(
            "surface-elevated inline-flex shrink-0 items-center justify-center transition-colors",
            dense ? "size-8" : "size-9",
            "text-muted-foreground hover:bg-muted hover:text-foreground",
            "disabled:pointer-events-none disabled:opacity-50",
            accent === "hg" && "hover:border-hg/30 hover:text-hg",
            accent === "git" && "hover:border-git/30 hover:text-git",
          )}
        >
          {picking ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <FolderOpen className="size-3.5" />
          )}
        </button>
      </div>
      {pickError && (
        <p className="text-ui-caption text-destructive">{pickError}</p>
      )}
    </div>
  );
}
