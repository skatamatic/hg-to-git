import { describe, expect, it } from "vitest";
import {
  gitIdentityFromEntry,
  isAuthorMappingComplete,
  mergeAuthorMappings,
  parseAuthorsMapContent,
  parseHgAuthorString,
  serializeAuthorsMap,
} from "./authorsMap.js";

describe("parseHgAuthorString", () => {
  it("parses name and email", () => {
    expect(parseHgAuthorString("Ada Lovelace <ada@example.com>")).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
    });
  });

  it("parses email-only and bare names", () => {
    expect(parseHgAuthorString("ada@example.com").email).toBe("ada@example.com");
    expect(parseHgAuthorString("Bot User").name).toBe("Bot User");
  });
});

describe("authors map round-trip", () => {
  const sample = [
    {
      hgAuthor: "Old <old@corp>",
      gitName: "New",
      gitEmail: "new@corp",
    },
    {
      hgAuthor: "Legacy",
      gitIdentity: "Full Name <full@corp>",
    },
  ];

  it("serializes and parses quoted map lines", () => {
    const text = serializeAuthorsMap(sample);
    const parsed = parseAuthorsMapContent(text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].hgAuthor).toBe("Old <old@corp>");
    expect(gitIdentityFromEntry(parsed[0])).toBe("New <new@corp>");
    expect(parsed[1].gitIdentity).toBe("Full Name <full@corp>");
  });

  it("detects complete mappings", () => {
    expect(isAuthorMappingComplete(sample[0])).toBe(true);
    expect(
      isAuthorMappingComplete({ hgAuthor: "x", gitName: "only-name" }),
    ).toBe(true);
    expect(isAuthorMappingComplete({ hgAuthor: "x" })).toBe(false);
  });
});

describe("mergeAuthorMappings", () => {
  it("keeps existing entries and adds scanned authors", () => {
    const merged = mergeAuthorMappings(
      [{ hgAuthor: "A", gitName: "A", gitEmail: "a@x" }],
      [
        { hgAuthor: "B", commitCount: 2, suggestedName: "B", suggestedEmail: "b@x" },
        { hgAuthor: "A", commitCount: 9 },
      ],
    );
    expect(merged.map((e) => e.hgAuthor)).toEqual(["A", "B"]);
    expect(merged[0].gitEmail).toBe("a@x");
    expect(merged[1].gitEmail).toBe("b@x");
  });
});
