#!/usr/bin/env node
/**
 * Add new commits and a branch to fixtures/test-hg for incremental sync testing.
 * Usage: npm run test:hg:evolve
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isHgRepository, resolveHgExecutable } from "./lib/resolve-hg.mjs";
import {
  EVOLVE_BETA_TAG,
  EVOLVE_TIP_TAG,
  evolveBatchTag,
  formatHgTagsListing,
} from "./lib/fixture-tags.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const fixtures = path.join(root, "fixtures");
const pathsFile = path.join(fixtures, "paths.json");
const defaultHg = path.join(fixtures, "test-hg");

let hgRepo = process.env.HG_TO_GIT_TEST_HG ?? defaultHg;
if (existsSync(pathsFile)) {
  try {
    const p = JSON.parse(readFileSync(pathsFile, "utf8"));
    if (p.hgRepo) hgRepo = p.hgRepo;
  } catch {
    /* */
  }
}

if (!isHgRepository(hgRepo)) {
  console.error(`No Mercurial repo at ${hgRepo}.`);
  console.error("Run: npm run test:hg:init -- --force");
  process.exit(1);
}

const hgExe = await resolveHgExecutable();
if (!hgExe) {
  console.error("Could not find hg. Set HG_TO_GIT_HG or install Mercurial.");
  process.exit(1);
}

const env = {
  ...process.env,
  HGUSER: process.env.HGUSER ?? "Test User <test@hg-to-git.local>",
  HGRCPATH: path.join(fixtures, ".hgrc"),
};

function hg(args) {
  const r = spawnSync(hgExe, args, { cwd: hgRepo, encoding: "utf8", env, shell: false });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || r.error);
    process.exit(1);
  }
  return (r.stdout ?? "").trim();
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const before = hg(["log", "-r", "tip", "-T", "{rev}"]);

writeFileSync(
  path.join(hgRepo, `evolve-${stamp}.txt`),
  `Evolution batch at ${new Date().toISOString()}\n`,
);
hg(["add", `evolve-${stamp}.txt`]);
hg(["commit", "-m", `evolve: default commit ${stamp}`]);

writeFileSync(path.join(hgRepo, `evolve-${stamp}-2.txt`), "second default commit in batch\n");
hg(["add", `evolve-${stamp}-2.txt`]);
hg(["commit", "-m", `evolve: default follow-up ${stamp}`]);

const batchId = stamp.slice(0, 10);
hg(["tag", evolveBatchTag(batchId)]);

const branchName = `feature-beta-${batchId}`;
hg(["branch", branchName]);
writeFileSync(path.join(hgRepo, `${branchName}.txt`), "beta branch work\n");
hg(["add", `${branchName}.txt`]);
hg(["commit", "-m", `evolve: ${branchName} first commit`]);
hg(["tag", EVOLVE_BETA_TAG]);

writeFileSync(path.join(hgRepo, `${branchName}-2.txt`), "beta branch more work\n");
hg(["add", `${branchName}-2.txt`]);
hg(["commit", "-m", `evolve: ${branchName} second commit`]);

hg(["update", "default"]);
hg(["tag", "-f", EVOLVE_TIP_TAG]);

const after = hg(["log", "-r", "tip", "-T", "{rev}"]);
const added = Math.max(0, parseInt(after, 10) - parseInt(before, 10));

console.log(`Updated ${hgRepo}`);
console.log(`  tip was r${before}, now r${after} (+${added} on default line)`);
console.log(`  new branch: ${branchName}`);
console.log(`  new tags: ${evolveBatchTag(batchId)}, ${EVOLVE_BETA_TAG}, ${EVOLVE_TIP_TAG} (moved)`);
console.log(`  all tags:\n${formatHgTagsListing((_, args) => hg(args), hgRepo)}`);
console.log("\nRe-open the project or click Refresh in Setup to see pending revisions.");
