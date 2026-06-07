import { describe, expect, it } from "vitest";
import { projectDraftPartial, projectHasUnsavedChanges } from "./projectDirty";
import type { Project } from "../types";

function project(overrides: Partial<Project> = {}): Project {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "p1",
    name: "Demo",
    hgRepo: "D:/hg",
    gitRepo: "D:/git",
    defaultBranch: "master",
    checkoutWorkingTree: false,
    simpleMode: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("projectHasUnsavedChanges", () => {
  it("detects edits to tracked setup fields", () => {
    const saved = project();
    const draft = project({ name: "Renamed" });
    expect(projectHasUnsavedChanges(draft, saved)).toBe(true);
    expect(projectHasUnsavedChanges(saved, saved)).toBe(false);
  });

});

describe("projectDraftPartial", () => {
  it("includes only editable setup fields", () => {
    const p = project({ lastRunAt: "2026-02-01", lastRunStatus: "success" });
    const partial = projectDraftPartial(p);
    expect(partial).not.toHaveProperty("lastRunAt");
    expect(partial).not.toHaveProperty("id");
    expect(partial.name).toBe("Demo");
    expect(partial.hgRepo).toBe("D:/hg");
  });
});
