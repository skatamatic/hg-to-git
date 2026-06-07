import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { LogEntry, LogLevel } from "../types";

let logId = 0;

const MAX_LOG_LINES = 800;
const FLUSH_MS = 32;

function nextId() {
  return String(++logId);
}

function isProgressLine(level: LogLevel) {
  return level === "progress";
}

export function useStreamLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [, startTransition] = useTransition();
  const pendingRef = useRef<LogEntry[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPending = useCallback(() => {
    flushTimerRef.current = null;
    const batch = pendingRef.current;
    if (batch.length === 0) return;
    pendingRef.current = [];

    startTransition(() => {
    setLogs((prev) => {
      let next = prev;
      for (const entry of batch) {
        if (
          isProgressLine(entry.level) &&
          entry.revisionMax != null &&
          next.length > 0
        ) {
          const last = next[next.length - 1];
          if (
            isProgressLine(last.level) &&
            last.revisionMax != null &&
            last.stream === entry.stream
          ) {
            next = [...next.slice(0, -1), entry];
            continue;
          }
        }
        next = [...next, entry];
      }
      if (next.length > MAX_LOG_LINES) {
        next = next.slice(-MAX_LOG_LINES);
      }
      return next;
    });
    });
  }, [startTransition]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current != null) return;
    flushTimerRef.current = setTimeout(flushPending, FLUSH_MS);
  }, [flushPending]);

  const appendLog = useCallback(
    (data: Record<string, unknown>) => {
      const level = (data.level as LogLevel) ?? "info";
      const message = String(data.message ?? "");
      if (!message) return;

      const prev = pendingRef.current[pendingRef.current.length - 1];
      if (
        prev?.message === message &&
        (level === "info" || level === "warn") &&
        /^Warning: sanitized (branch|tag)/i.test(message)
      ) {
        return;
      }

      pendingRef.current.push({
        id: nextId(),
        level,
        message,
        stream: data.stream as string | undefined,
        revisionCurrent: data.revisionCurrent as number | undefined,
        revisionMax: data.revisionMax as number | undefined,
        branch: data.branch as string | undefined,
        at: Date.now(),
      });
      if (isProgressLine(level)) {
        flushPending();
      } else {
        scheduleFlush();
      }
    },
    [flushPending, scheduleFlush],
  );

  const appendError = useCallback(
    (message: string) => {
      pendingRef.current.push({
        id: nextId(),
        level: "error",
        message,
        at: Date.now(),
      });
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const clearLogs = useCallback(() => {
    pendingRef.current = [];
    if (flushTimerRef.current != null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    setLogs([]);
  }, []);

  useEffect(
    () => () => {
      if (flushTimerRef.current != null) {
        clearTimeout(flushTimerRef.current);
      }
    },
    [],
  );

  return { logs, appendLog, appendError, clearLogs, setLogs };
}
