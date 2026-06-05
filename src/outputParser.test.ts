import { describe, expect, it } from "vitest";
import { aggregateProgress, parseOutputLine } from "./outputParser.js";

describe("parseOutputLine", () => {
  it("classifies errors and warnings", () => {
    expect(parseOutputLine("error: boom").level).toBe("error");
    expect(parseOutputLine("warning: sanitized name").level).toBe("warn");
  });

  it("parses revision progress with branch", () => {
    const revLine =
      "feature: Exporting blob revision 5/10 with 1/1 files";
    const r = parseOutputLine(revLine);
    expect(r.level).toBe("progress");
    expect(r.revisionCurrent).toBe(5);
    expect(r.revisionMax).toBe(10);
    expect(r.filesCurrent).toBe(1);
    expect(r.filesMax).toBe(1);
    expect(r.branch).toBe("feature");
  });

  it("parses file-only progress", () => {
    const p = parseOutputLine("Exported 3/9 files");
    expect(p.filesCurrent).toBe(3);
    expect(p.filesMax).toBe(9);
  });

  it("parses tag export lines", () => {
    const p = parseOutputLine("Exporting tag [v1.0.0]");
    expect(p.branch).toBe("v1.0.0");
    expect(p.level).toBe("progress");
  });

  it("marks completion lines as success", () => {
    expect(parseOutputLine("issued 42 commands").level).toBe("success");
    expect(parseOutputLine("Import complete").level).toBe("success");
  });
});

describe("aggregateProgress", () => {
  it("returns percent from latest revision progress line", () => {
    const lines = [
      parseOutputLine("default: Exporting commit 2/8 with 0/1 files"),
      parseOutputLine("default: Exporting commit 5/8 with 1/1 files"),
    ];
    lines[0].revisionCurrent = 2;
    lines[0].revisionMax = 8;
    lines[0].branch = "default";
    lines[1].revisionCurrent = 5;
    lines[1].revisionMax = 8;
    lines[1].branch = "default";

    const agg = aggregateProgress(lines);
    expect(agg?.percent).toBe(63);
    expect(agg?.label).toContain("5 / 8");
    expect(agg?.label).toContain("default");
  });

  it("returns null when no revision progress", () => {
    expect(aggregateProgress([parseOutputLine("starting")])).toBeNull();
  });
});
