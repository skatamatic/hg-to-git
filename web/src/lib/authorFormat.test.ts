import { describe, expect, it } from "vitest";
import { gitIdentityFromEntry, isAuthorMappingComplete } from "./authorFormat";

describe("authorFormat", () => {
  it("builds git identity from name and email", () => {
    expect(
      gitIdentityFromEntry({
        hgAuthor: "old",
        gitName: "New",
        gitEmail: "n@corp",
      }),
    ).toBe("New <n@corp>");
  });

  it("prefers explicit gitIdentity", () => {
    expect(
      gitIdentityFromEntry({
        hgAuthor: "x",
        gitIdentity: "Override <o@corp>",
        gitName: "Ignored",
      }),
    ).toBe("Override <o@corp>");
  });

  it("marks incomplete entries", () => {
    expect(isAuthorMappingComplete({ hgAuthor: "x", gitEmail: "a@b" })).toBe(true);
    expect(isAuthorMappingComplete({ hgAuthor: "x" })).toBe(false);
  });
});
