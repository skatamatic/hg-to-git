import { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";
import type { LogEntry, LogLevel } from "../types";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";

interface Props {
  logs: LogEntry[];
  running: boolean;
  /** Fills parent panel (output dock) instead of card layout */
  embedded?: boolean;
}

const levelStyles: Record<LogLevel, string> = {
  info: "text-muted-foreground/90",
  progress: "text-foreground",
  warn: "text-warning",
  error: "text-destructive",
  success: "text-success",
};

const levelDot: Record<LogLevel, string> = {
  info: "bg-muted-foreground/40",
  progress: "bg-accent",
  warn: "bg-warning",
  error: "bg-destructive",
  success: "bg-success",
};

export function LogPanel({ logs, running, embedded }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: running ? "auto" : "smooth" });
  }, [logs.length, running]);

  const body = (
    <div className="text-ui-mono p-3 leading-[1.6]">
            {logs.length === 0 && (
              <p className="text-ui-caption py-16 text-center text-muted-foreground/80">
                Waiting for hg-fast-export output…
              </p>
            )}
            {logs.map((entry, i) => (
              <div
                key={entry.id}
                className={cn(
                  "flex gap-2.5 rounded-md px-2 py-0.5",
                  entry.level === "error" && "bg-destructive/[0.06]",
                  entry.level === "warn" && "bg-warning/[0.05]",
                )}
              >
                <span className="w-5 shrink-0 select-none text-right text-muted-foreground/35">
                  {i + 1}
                </span>
                <span
                  className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", levelDot[entry.level])}
                />
                {entry.revisionCurrent != null && entry.revisionMax != null && (
                  <span className="w-12 shrink-0 tabular-nums text-accent/70">
                    {entry.revisionCurrent}/{entry.revisionMax}
                  </span>
                )}
                <span className={cn("min-w-0 flex-1 break-words", levelStyles[entry.level])}>
                  {entry.message}
                </span>
                {(entry.level === "warn" || entry.level === "error") && (
                  <Badge
                    variant={entry.level === "error" ? "destructive" : "warning"}
                    className="hidden h-5 shrink-0 sm:inline-flex"
                  >
                    {entry.level}
                  </Badge>
                )}
              </div>
            ))}
            <div ref={endRef} />
    </div>
  );

  if (embedded) {
    return (
      <ScrollArea className="h-full rounded-md border border-border/50 bg-muted/20">
        {body}
      </ScrollArea>
    );
  }

  return (
    <Card className="flex flex-col overflow-hidden border-border/60 bg-muted/30">
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border/50 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </div>
          <CardTitle className="text-ui-label flex items-center gap-2">
            <Terminal className="size-3.5" />
            export stream
          </CardTitle>
        </div>
        <div className="flex items-center gap-2">
          {running && (
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-accent" />
            </span>
          )}
          <span className="text-ui-mono tabular-nums text-muted-foreground">
            {logs.length} lines
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-[min(260px,36vh)]">{body}</ScrollArea>
      </CardContent>
    </Card>
  );
}
