import { describe, expect, it } from "vitest";
import {
  applyRecent,
  ensureRecentPopulated,
  getRecentProjects,
  pruneRecentProjectIds,
} from "./projectRecent.js";
import type { Project, ProjectsState } from "./server/projects.js";

function project(overrides: Partial<Project> & { id: string }): Project {
  const t = "2025-06-01T00:00:00.000Z";
  const { id, name, updatedAt, ...rest } = overrides;
  return {
    id,
    name: name ?? id,
    hgRepo: "D:\\hg",
    gitRepo: "D:\\git",
    createdAt: t,
    updatedAt: updatedAt ?? t,
    ...rest,
  };
}

function state(overrides: Partial<ProjectsState> = {}): ProjectsState {
  return {
    version: 1,
    lastProjectId: null,
    projects: [],
    recentProjectIds: [],
    ...overrides,
  };
}

describe("projectRecent", () => {
  it("only tracks projects saved to disk", () => {
    const s = state({
      projects: [
        project({ id: "a", projectFile: "D:\\a.hg-to-git-project.json" }),
        project({ id: "b" }),
      ],
    });
    const next = applyRecent(s, "b");
    expect(next.recentProjectIds).toEqual([]);
    const saved = applyRecent(s, "a");
    expect(saved.recentProjectIds).toEqual(["a"]);
  });

  it("prunes missing or unsaved recent ids", () => {
    const s = state({
      projects: [project({ id: "a", projectFile: "D:\\a.hg-to-git-project.json" })],
      recentProjectIds: ["a", "gone", "b"],
    });
    const pruned = pruneRecentProjectIds(s);
    expect(pruned.recentProjectIds).toEqual(["a"]);
  });

  it("backfills recent from saved projects when empty", () => {
    const s = state({
      projects: [
        project({
          id: "old",
          projectFile: "D:\\old.hg-to-git-project.json",
          updatedAt: "2025-01-01T00:00:00.000Z",
        }),
        project({
          id: "new",
          projectFile: "D:\\new.hg-to-git-project.json",
          updatedAt: "2025-06-01T00:00:00.000Z",
        }),
      ],
      recentProjectIds: [],
    });
    const next = ensureRecentPopulated(s);
    expect(next.recentProjectIds).toEqual(["new", "old"]);
    expect(getRecentProjects(next).map((p) => p.id)).toEqual(["new", "old"]);
  });
});
