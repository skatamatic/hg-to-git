import { describe, expect, it } from "vitest";
import { parseUnnamedHeadRevisions } from "./hgHeads.js";

describe("parseUnnamedHeadRevisions", () => {
  it("returns extra tips per branch name", () => {
    expect(
      parseUnnamedHeadRevisions([
        { rev: 10, branch: "default" },
        { rev: 5015, branch: "default" },
        { rev: 20, branch: "feature" },
      ]),
    ).toEqual([5015]);
  });

  it("returns empty when each branch has one head", () => {
    expect(
      parseUnnamedHeadRevisions([
        { rev: 1, branch: "default" },
        { rev: 2, branch: "feature" },
      ]),
    ).toEqual([]);
  });
});
