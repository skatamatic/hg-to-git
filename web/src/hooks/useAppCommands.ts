import { useEffect, useRef } from "react";
import { subscribeAppCommand } from "../api";
import type { AppView } from "../types";

export type AppCommandHandler = (payload: {
  command: string;
  payload?: unknown;
}) => void;

/** Keep a stable IPC subscription; handler can change without missing menu events. */
export function useAppCommands(handler: AppCommandHandler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return subscribeAppCommand((payload) => handlerRef.current(payload));
  }, []);
}

export function parseViewCommand(command: string): AppView | null {
  if (command === "view:setup") return "setup";
  if (command === "view:results") return "results";
  return null;
}
