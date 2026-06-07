import { describe, expect, it } from "vitest";
import {
  defaultProjectFileName,
  parseProjectFile,
  PROJECT_FILE_SUFFIX,
  serializeProjectFile,
} from "./projectFile.js";
import type { Project } from "./server/projects.js";

const sampleProject: Project = {
  id: "id-1",
  name: "Spyglass",
  hgRepo: "D:\\hg\\spyglass",
  gitRepo: "D:\\git\\spyglass",
  defaultBranch: "master",
  checkoutWorkingTree: true,
  simpleMode: false,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

describe("projectFile", () => {
  it("round-trips project settings without workspace metadata", () => {
    const raw = serializeProjectFile(sampleProject);
    const parsed = parseProjectFile(raw);
    expect(parsed.name).toBe("Spyglass");
    expect(parsed.hgRepo).toBe(sampleProject.hgRepo);
    expect(parsed.gitRepo).toBe(sampleProject.gitRepo);
    expect(parsed.defaultBranch).toBe("master");
    expect(raw).not.toContain("id-1");
    expect(raw).not.toContain("createdAt");
  });

  it("rejects invalid project files", () => {
    expect(() => parseProjectFile("{")).toThrow(/valid JSON/i);
    expect(() => parseProjectFile('{"version":2,"name":"x","hgRepo":"a","gitRepo":"b"}')).toThrow(
      /unsupported/i,
    );
    expect(() =>
      parseProjectFile('{"version":1,"name":"","hgRepo":"a","gitRepo":"b"}'),
    ).toThrow(/missing a name/i);
  });

  it("builds a safe default filename", () => {
    expect(defaultProjectFileName("Spyglass")).toBe(`Spyglass${PROJECT_FILE_SUFFIX}`);
    expect(defaultProjectFileName("bad/name")).toBe(`badname${PROJECT_FILE_SUFFIX}`);
  });
});
