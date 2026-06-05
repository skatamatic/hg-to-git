import { describe, expect, it } from "vitest";
import { parseViewCommand } from "./useAppCommands";

describe("parseViewCommand", () => {
  it("maps menu view commands to app views", () => {
    expect(parseViewCommand("view:setup")).toBe("setup");
    expect(parseViewCommand("view:results")).toBe("results");
    expect(parseViewCommand("run:convert")).toBeNull();
  });
});
