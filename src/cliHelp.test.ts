import { Command } from "commander";
import { describe, expect, it } from "vitest";
import {
  renderCliHelp,
  shouldShowRootHelp,
} from "./cliHelp.js";

describe("cliHelp", () => {
  it("shows root help when no args", () => {
    expect(shouldShowRootHelp(["node", "cli.js"])).toBe(true);
  });

  it("shows root help for -h without subcommand", () => {
    expect(shouldShowRootHelp(["node", "cli.js", "-h"])).toBe(true);
    expect(shouldShowRootHelp(["node", "cli.js", "--help"])).toBe(true);
  });

  it("does not show root help for subcommands", () => {
    expect(shouldShowRootHelp(["node", "cli.js", "status", "-h"])).toBe(false);
    expect(shouldShowRootHelp(["node", "cli.js", "convert"])).toBe(false);
  });

  it("renders help with commands and quick start", () => {
    const program = new Command("hg-to-git")
      .description("Test CLI")
      .version("1.0.0");
    program.command("convert").description("Run conversion");
    program.command("status").description("Show status");

    const text = renderCliHelp(program, { color: false });
    expect(text).toContain("hg-to-git");
    expect(text).toContain("convert");
    expect(text).toContain("status");
    expect(text).toContain("Quick start");
    expect(text).toContain("--json");
  });
});
