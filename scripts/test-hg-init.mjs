#!/usr/bin/env node
/**
 * Create fixtures/test-hg (sample Hg history) and fixtures/test-git (empty Git repo).
 * Usage: npm run test:hg:init [-- --force]
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isHgRepository, resolveHgExecutable } from "./lib/resolve-hg.mjs";
import { formatHgTagsListing, INIT_TAGS } from "./lib/fixture-tags.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const fixtures = path.join(root, "fixtures");
const hgRepo = process.env.HG_TO_GIT_TEST_HG ?? path.join(fixtures, "test-hg");
const gitRepo = process.env.HG_TO_GIT_TEST_GIT ?? path.join(fixtures, "test-git");
const force = process.argv.includes("--force");

const hgExe = await resolveHgExecutable();
if (!hgExe) {
  console.error(
    "Could not find hg.\n" +
      "  • Install Mercurial (pip install mercurial, or the app setup wizard)\n" +
      "  • Or set HG_TO_GIT_HG to the full path to hg.exe\n" +
      "  • Then run: npm run test:hg:init",
  );
  process.exit(1);
}

console.log(`Using hg: ${hgExe}\n`);

const env = {
  ...process.env,
  PATH: process.env.PATH,
  HGUSER: process.env.HGUSER ?? "Test User <test@hg-to-git.local>",
  HGRCPATH: process.env.HGRCPATH ?? path.join(fixtures, ".hgrc"),
};

mkdirSync(fixtures, { recursive: true });
writeFileSync(
  path.join(fixtures, ".hgrc"),
  "[ui]\nusername = Test User <test@hg-to-git.local>\n",
);

function hg(cwd, args) {
  const r = spawnSync(hgExe, args, {
    cwd,
    encoding: "utf8",
    env,
    shell: false,
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || r.error);
    throw new Error(`hg ${args.join(" ")} failed (cwd=${cwd})`);
  }
  return (r.stdout ?? "").trim();
}

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    throw new Error(`git ${args.join(" ")} failed in ${cwd}`);
  }
}

function prepareHgDir(dir) {
  if (existsSync(dir) && isHgRepository(dir) && !force) {
    console.log(`Hg repo already seeded: ${dir}`);
    console.log("Pass --force to recreate.");
    return false;
  }
  if (existsSync(dir)) {
    if (isHgRepository(dir) && force) {
      console.log(`Removing existing Hg repo (--force): ${dir}`);
    } else if (!isHgRepository(dir)) {
      console.log(`Removing incomplete folder (no .hg): ${dir}`);
    }
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
  return true;
}

function prepareGitDir(dir) {
  if (existsSync(dir) && existsSync(path.join(dir, ".git")) && !force) {
    console.log(`Git repo already exists: ${dir}`);
    console.log("Pass --force to recreate.");
    return false;
  }
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
  return true;
}

console.log("Creating test repositories…\n");

let hgSeeded = false;

if (prepareHgDir(hgRepo)) {
  hg(hgRepo, ["init"]);
  writeFileSync(path.join(hgRepo, "README.md"), "# test-hg\n\nFixture repo for hg-to-git.\n");
  hg(hgRepo, ["add", "README.md"]);
  hg(hgRepo, ["commit", "-m", "initial: add readme"]);

  for (let i = 1; i <= 4; i++) {
    writeFileSync(
      path.join(hgRepo, `notes-${i}.txt`),
      `Change set ${i} on default branch.\n`,
    );
    hg(hgRepo, ["add", `notes-${i}.txt`]);
    hg(hgRepo, ["commit", "-m", `default: change ${i}`]);
  }

  hg(hgRepo, ["tag", INIT_TAGS[0]]);

  hg(hgRepo, ["branch", "feature-alpha"]);
  writeFileSync(path.join(hgRepo, "feature-alpha.txt"), "feature-alpha work\n");
  hg(hgRepo, ["add", "feature-alpha.txt"]);
  hg(hgRepo, ["commit", "-m", "feature-alpha: start feature"]);

  writeFileSync(path.join(hgRepo, "feature-alpha-2.txt"), "more alpha\n");
  hg(hgRepo, ["add", "feature-alpha-2.txt"]);
  hg(hgRepo, ["commit", "-m", "feature-alpha: second commit"]);
  hg(hgRepo, ["tag", INIT_TAGS[1]]);

  hg(hgRepo, ["update", "default"]);
  writeFileSync(path.join(hgRepo, "merge-prep.txt"), "prepare merge on default\n");
  hg(hgRepo, ["add", "merge-prep.txt"]);
  hg(hgRepo, ["commit", "-m", "default: after feature work"]);
  hg(hgRepo, ["tag", INIT_TAGS[2]]);

  if (!isHgRepository(hgRepo)) {
    console.error("Hg init appeared to succeed but .hg is missing.");
    process.exit(1);
  }

  const tip = hg(hgRepo, ["log", "-r", "tip", "-T", "{rev}"]);
  const branches = hg(hgRepo, ["branches"]);
  const tags = formatHgTagsListing(hg, hgRepo);
  console.log(`Hg: ${hgRepo}`);
  console.log(`  tip revision: ${tip}`);
  console.log(`  branches:\n${branches.split("\n").map((l) => `    ${l}`).join("\n")}`);
  console.log(`  tags:\n${tags}`);
  console.log(`  (init tags: ${INIT_TAGS.join(", ")})`);
  hgSeeded = true;
} else if (isHgRepository(hgRepo)) {
  hgSeeded = true;
}

if (prepareGitDir(gitRepo)) {
  git(gitRepo, ["init"]);
  git(gitRepo, ["config", "core.ignoreCase", "false"]);
  console.log(
    `\nGit: ${gitRepo} (empty — no commits; hg-fast-export will create branches)`,
  );
}

if (!hgSeeded || !isHgRepository(hgRepo)) {
  console.error(
    "\nMercurial fixture was not created. Fix hg availability and re-run:\n" +
      "  npm run test:hg:init -- --force",
  );
  process.exit(1);
}

const manifest = {
  hgRepo: path.resolve(hgRepo),
  gitRepo: path.resolve(gitRepo),
  createdAt: new Date().toISOString(),
  hgExecutable: hgExe,
};
writeFileSync(
  path.join(fixtures, "paths.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);

console.log("\n--- Project paths (paste into Setup) ---");
console.log(`Hg:  ${manifest.hgRepo}`);
console.log(`Git: ${manifest.gitRepo}`);
console.log("\nSaved fixtures/paths.json");
