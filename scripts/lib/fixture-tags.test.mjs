import { describe, expect, it } from "vitest";
import {
  EVOLVE_BETA_TAG,
  EVOLVE_TIP_TAG,
  INIT_TAGS,
  evolveBatchTag,
} from "./fixture-tags.mjs";

describe("fixture-tags", () => {
  it("defines stable init tag names", () => {
    expect(INIT_TAGS).toEqual(["fixture-v0.1", "alpha-v1", "fixture-v0.2"]);
  });

  it("builds evolve batch tag from date id", () => {
    expect(evolveBatchTag("2026-06-04")).toBe("evolve-2026-06-04");
    expect(EVOLVE_BETA_TAG).toBe("evolve-beta-v1");
    expect(EVOLVE_TIP_TAG).toBe("evolve-latest");
  });
});
