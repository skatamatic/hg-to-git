import { describe, expect, it } from "vitest";
import { formatCommitAuthorLine, formatCommitDate } from "./commitDate";

describe("formatCommitDate", () => {
  it("formats ISO git author dates", () => {
    const formatted = formatCommitDate("2024-06-03 14:30:45 -0500");
    expect(formatted).toBeTruthy();
    expect(formatted).toContain("2024");
  });

  it("ignores epoch placeholders and invalid strings", () => {
    expect(formatCommitDate("1970-01-01 00:00 +0000")).toBeUndefined();
    expect(formatCommitDate("not-a-date")).toBeUndefined();
  });
});

describe("formatCommitAuthorLine", () => {
  it("joins author and date", () => {
    const line = formatCommitAuthorLine(
      "Ada Lovelace",
      "2024-06-03 14:30:45 +0000",
    );
    expect(line).toMatch(/^Ada Lovelace - /);
  });

  it("falls back when date missing", () => {
    expect(formatCommitAuthorLine("Ada Lovelace")).toBe("Ada Lovelace");
    expect(formatCommitAuthorLine()).toBe("Unknown author");
  });
});
