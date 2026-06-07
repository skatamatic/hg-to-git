import { describe, expect, it } from "vitest";
import {
  mergeTagsMap,
  sanitizeGitTagName,
  serializeTagsMap,
} from "./tagMapping.js";

describe("sanitizeGitTagName", () => {
  it("sanitizes spaces like hg-fast-export", () => {
    expect(sanitizeGitTagName("Spyglass 2.7.1")).toBe("Spyglass_2.7.1");
    expect(sanitizeGitTagName("Spyglass-3.0 RC1")).toBe("Spyglass-3.0_RC1");
    expect(sanitizeGitTagName("2.12.4 A")).toBe("2.12.4_A");
  });
});

describe("mergeTagsMap", () => {
  it("maps hg tags that need sanitization", () => {
    const map = mergeTagsMap([
      "Spyglass-8.5.1",
      "Spyglass 2.7.1",
      "Spyglass-3.0 RC1",
    ]);
    expect(map.get("Spyglass-8.5.1")).toBe("Spyglass-8.5.1");
    expect(map.get("Spyglass 2.7.1")).toBe("Spyglass_2.7.1");
    expect(map.get("Spyglass-3.0 RC1")).toBe("Spyglass-3.0_RC1");
  });

  it("skips tip", () => {
    const map = mergeTagsMap(["tip", "1.0.0"]);
    expect(map.has("tip")).toBe(false);
    expect(map.get("1.0.0")).toBe("1.0.0");
  });
});

describe("serializeTagsMap", () => {
  it("quotes tag names with spaces", () => {
    const text = serializeTagsMap(
      new Map([["Spyglass 2.7.1", "Spyglass_2.7.1"]]),
    );
    expect(text).toContain('"Spyglass 2.7.1"="Spyglass_2.7.1"');
  });
});
