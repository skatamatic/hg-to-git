import { describe, expect, it } from "vitest";
import {
  buildAlignedBranchRows,
  countBranchIssues,
  rowExpandedClass,
  rowHoverClass,
  rowSurfaceClass,
  statusBadgeVariant,
  statusLabel,
} from "./branchAlign";
import { makeRepoSnapshot } from "../test/snapshotFactory";

describe("buildAlignedBranchRows", () => {
  it("aligns hg and git sides from branch deltas", () => {
    const snapshot = makeRepoSnapshot({
      branchDeltas: [
        {
          name: "default",
          status: "synced",
          hgBranch: "default",
          gitBranch: "master",
          hgRevision: 5,
        },
        { name: "feature-alpha", status: "hg_only", hgBranch: "feature-alpha" },
        { name: "orphan", status: "git_only", gitBranch: "orphan" },
      ],
      hg: {
        valid: true,
        branches: [
          { name: "default", revision: 5 },
          { name: "feature-alpha", revision: 3 },
        ],
      },
      git: {
        valid: true,
        branches: [
          { name: "master", tip: "aaa" },
          { name: "orphan", tip: "bbb" },
        ],
        tags: [],
      },
    });

    const rows = buildAlignedBranchRows(snapshot);
    expect(rows).toHaveLength(3);
    expect(rows[0].status).toBe("hg_only");
    expect(rows[0].hg?.name).toBe("feature-alpha");
    expect(rows[0].git).toBeNull();

    const synced = rows.find((r) => r.status === "synced");
    expect(synced?.hg?.name).toBe("default");
    expect(synced?.git?.name).toBe("master");
  });

  it("sorts issues before synced branches", () => {
    const snapshot = makeRepoSnapshot({
      branchDeltas: [
        { name: "default", status: "synced" },
        { name: "feature", status: "pending", hgBranch: "feature" },
      ],
    });
    const rows = buildAlignedBranchRows(snapshot);
    expect(rows[0].status).toBe("pending");
    expect(rows[1].status).toBe("synced");
  });
});

describe("branch row helpers", () => {
  it("counts non-synced rows as issues", () => {
    expect(
      countBranchIssues([
        { id: "1", status: "synced", hg: null, git: null },
        { id: "2", status: "pending", hg: null, git: null },
      ]),
    ).toBe(1);
  });

  it("maps status to labels, badge variants, and surface classes", () => {
    expect(statusLabel("hg_only")).toBe("Hg only");
    expect(statusBadgeVariant("pending")).toBe("warning");
    expect(rowSurfaceClass("git_only")).toContain("git");
    expect(rowHoverClass("pending")).toContain("warning");
    expect(rowExpandedClass("unmapped")).toContain("destructive");
  });
});
