import { describe, expect, it } from "vitest";
import { progressFromLogs } from "./progressFromLogs";
import type { LogEntry } from "../types";

function log(partial: Partial<LogEntry>): LogEntry {
  return {
    id: "test",
    level: "progress",
    message: "",
    at: 0,
    ...partial,
  };
}

describe("progressFromLogs", () => {
  it("computes percent from latest revision progress entry", () => {
    const result = progressFromLogs([
      log({ revisionCurrent: 2, revisionMax: 8, branch: "default" }),
      log({ revisionCurrent: 4, revisionMax: 8, branch: "default" }),
    ]);
    expect(result.percent).toBe(50);
    expect(result.label).toContain("4 of 8");
    expect(result.label).toContain("default");
  });

  it("returns empty progress when no revision data", () => {
    expect(progressFromLogs([log({ level: "info", message: "hi" })])).toEqual({
      percent: 0,
      label: "",
    });
  });
});
