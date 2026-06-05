import { describe, expect, it } from "vitest";
import { branchRowGridClass, branchRowPaddingClass } from "./branchGrid";

describe("branchGrid", () => {
  it("uses wider status column in full layout", () => {
    expect(branchRowGridClass(false)).toContain("84px");
    expect(branchRowGridClass(true)).toContain("72px");
  });

  it("uses sidebar-specific grid when compact sidebar", () => {
    expect(branchRowGridClass(true, true)).toContain("4.75rem");
  });

  it("applies consistent padding classes", () => {
    expect(branchRowPaddingClass(false)).toContain("px-3");
    expect(branchRowPaddingClass(true, true)).toContain("px-2");
  });
});
