import { describe, expect, it } from "vitest";
import { branchNameFromGitRef, tagNameFromGitRef } from "./gitRefs.js";

describe("branchNameFromGitRef", () => {
  it("strips refs/heads without disambiguation prefix", () => {
    expect(branchNameFromGitRef("refs/heads/2.12.3")).toBe("2.12.3");
    expect(branchNameFromGitRef("refs/heads/feature/foo")).toBe("feature/foo");
  });
});

describe("tagNameFromGitRef", () => {
  it("strips refs/tags without disambiguation prefix", () => {
    expect(tagNameFromGitRef("refs/tags/2.12.3")).toBe("2.12.3");
    expect(tagNameFromGitRef("refs/tags/Spyglass 2.7.1")).toBe("Spyglass 2.7.1");
  });
});
