import { describe, expect, it } from "vitest";
import { depsSatisfied, resolveStartupBlockingMode } from "./startupOverlay";
import type { ToolchainReport } from "../types";

const okToolchain: ToolchainReport = {
  ok: true,
  platform: "win32",
  canAutoInstall: false,
  tools: [],
};

const badToolchain: ToolchainReport = {
  ok: false,
  platform: "win32",
  canAutoInstall: true,
  tools: [{ id: "hg", name: "Hg", description: "", installed: false, canAutoInstall: true }],
};

describe("resolveStartupBlockingMode", () => {
  it("shows loading while toolchain is loading", () => {
    expect(
      resolveStartupBlockingMode({
        toolchainLoading: true,
        toolchain: null,
        projectsLoading: false,
        projectLoadPending: false,
      })?.type,
    ).toBe("loading");
  });

  it("shows deps overlay when toolchain is not ok", () => {
    const mode = resolveStartupBlockingMode({
      toolchainLoading: false,
      toolchain: badToolchain,
      projectsLoading: false,
      projectLoadPending: false,
    });
    expect(mode?.type).toBe("deps");
    expect(mode && "report" in mode && mode.report.ok).toBe(false);
  });

  it("shows project refresh overlay with detail text", () => {
    const mode = resolveStartupBlockingMode({
      toolchainLoading: false,
      toolchain: okToolchain,
      projectsLoading: false,
      projectLoadPending: true,
      projectName: "Demo",
      projectLoadDetail: "Reading Mercurial branches…",
    });
    expect(mode?.type).toBe("loading");
    expect(mode && "subtitle" in mode && mode.subtitle).toBe(
      "Reading Mercurial branches…",
    );
  });

  it("returns null when startup is complete", () => {
    expect(
      resolveStartupBlockingMode({
        toolchainLoading: false,
        toolchain: okToolchain,
        projectsLoading: false,
        projectLoadPending: false,
      }),
    ).toBeNull();
  });
});

describe("depsSatisfied", () => {
  it("requires toolchain.ok", () => {
    expect(depsSatisfied(okToolchain)).toBe(true);
    expect(depsSatisfied(badToolchain)).toBe(false);
    expect(depsSatisfied(null)).toBe(false);
  });
});
