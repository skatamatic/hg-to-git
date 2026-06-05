/**
 * Predictable Mercurial tags for fixture repos (manual / UI testing).
 */

/** Tags created by `npm run test:hg:init` (tagged at current parent when each runs). */
export const INIT_TAGS = ["fixture-v0.1", "alpha-v1", "fixture-v0.2"];

/** Tag on the new beta branch after its first commit in `test:hg:evolve`. */
export const EVOLVE_BETA_TAG = "evolve-beta-v1";

/** Moved to default tip on each evolve run (`hg tag -f`). */
export const EVOLVE_TIP_TAG = "evolve-latest";

/** Per-batch tag on default after evolve's two default commits. */
export function evolveBatchTag(batchId) {
  return `evolve-${batchId}`;
}

export function formatHgTagsListing(hg, hgRepo) {
  const out = hg(hgRepo, ["tags"]);
  if (!out) return "(none)";
  return out
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => `    ${l}`)
    .join("\n");
}
