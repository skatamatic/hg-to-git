#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig, resolveConfigPath } from "./config.js";
import { convertHgToGit } from "./fastExport.js";
import { parseOutputLine } from "./outputParser.js";
import { checkIgnoreCase, detectVersions } from "./prerequisites.js";

const program = new Command();

program
  .name("hg-to-git")
  .description(
    "Convert Mercurial repositories to Git using hg-fast-export (incremental sync supported)",
  )
  .version("1.0.0");

program
  .command("convert")
  .description("Import or incrementally sync hg history into a git repository")
  .option("-c, --config <path>", "Path to .hg-to-git.json")
  .option("--hg-repo <path>", "Mercurial repository path")
  .option("--git-repo <path>", "Git repository path")
  .option("--authors-map <path>", "Author identity mapping file")
  .option("--branches-map <path>", "Branch rename mapping file")
  .option("--tags-map <path>", "Tag rename mapping file")
  .option("-M, --default-branch <name>", "Git name for hg default branch")
  .option("-e, --encoding <enc>", "Commit/author encoding")
  .option("--fe <enc>", "Filename encoding")
  .option("-n, --no-sanitize", "Disable branch/tag name sanitization")
  .option("--no-hgtags", "Do not export .hgtags")
  .option("-s, --signed-off-by", "Use Signed-off-by for author")
  .option("--ignore-unnamed-heads", "Skip unnamed heads")
  .option("-f, --force", "Ignore validation errors")
  .option("-m, --max-revision <n>", "Max hg revision", parseInt)
  .option("--no-repack", "Skip git gc after import")
  .option(
    "--checkout",
    "Check out the configured default branch after import (working tree)",
  )
  .option("--fast-export <path>", "Path to fast-export checkout")
  .option("--python <exe>", "Python executable with mercurial module")
  .option("--dry-run", "Validate tools and config only")
  .action(async (opts) => {
    const gitRepo = opts.gitRepo as string | undefined;
    const configPath =
      (opts.config as string | undefined) ??
      (gitRepo ? resolveConfigPath(gitRepo) : undefined);

    const config = await loadConfig(configPath, {
      hgRepo: opts.hgRepo,
      gitRepo: opts.gitRepo,
      authorsMap: opts.authorsMap,
      branchesMap: opts.branchesMap,
      tagsMap: opts.tagsMap,
      defaultBranch: opts.defaultBranch,
      encoding: opts.encoding,
      fileEncoding: opts.fe,
      sanitizeNames: opts.noSanitize ? false : undefined,
      hgTags: opts.noHgtags ? false : undefined,
      signedOffBy: opts.signedOffBy,
      ignoreUnnamedHeads: opts.ignoreUnnamedHeads,
      force: opts.force,
      maxRevision: opts.maxRevision,
      repackAfterImport: opts.noRepack ? false : undefined,
      checkoutWorkingTree: opts.checkout ? true : undefined,
      fastExportPath: opts.fastExport,
      python: opts.python,
    });

    checkIgnoreCase(config.gitRepo, config.force);
    const versions = detectVersions(
      config.gitRepo,
      config.hgRepo,
      config.python,
    );

    console.log("Tools:");
    console.log(`  ${versions.git}`);
    console.log(`  ${versions.hg}`);
    console.log(`  ${versions.python}`);
    console.log(`  mercurial ${versions.mercurial}`);
    console.log(`Hg repo:  ${config.hgRepo}`);
    console.log(`Git repo: ${config.gitRepo}`);

    if (opts.dryRun) {
      console.log("Dry run OK.");
      return;
    }

    const result = await convertHgToGit(config, {
      onLine: (stream, line) => {
        if (!line.trim()) return;
        const parsed = parseOutputLine(line);
        if (!parsed.message) return;
        process.stderr.write(`[${stream}] ${parsed.message}\n`);
      },
    });
    console.log(
      result.incremental
        ? `Incremental import: ${result.revisionsImported} new hg revision(s).`
        : `Initial import complete (${result.revisionsImported} revision(s) in this run).`,
    );
    console.log(
      `State stored in ${result.gitDir} (${result.stateFiles.join(", ")}).`,
    );
    console.log(
      "Re-run the same command after pulling new hg commits to sync incrementally.",
    );
    if (!config.checkoutWorkingTree) {
      console.log(
        "Note: fast-import does not update the working tree. Re-run with --checkout or enable checkout in config.",
      );
    }
  });

program
  .command("init-config")
  .description("Write an example .hg-to-git.json in the git repo")
  .requiredOption("--git-repo <path>", "Git repository path")
  .requiredOption("--hg-repo <path>", "Mercurial repository path")
  .action(async (opts) => {
    const { writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const gitRepo = path.resolve(opts.gitRepo);
    const example = {
      hgRepo: path.resolve(opts.hgRepo),
      gitRepo,
      defaultBranch: "master",
      sanitizeNames: false,
      hgTags: true,
      repackAfterImport: true,
      authorsMap: "authors.map",
      branchesMap: null,
      tagsMap: null,
    };
    const out = path.join(gitRepo, ".hg-to-git.json");
    await writeFile(out, JSON.stringify(example, null, 2) + "\n");
    console.log(`Wrote ${out}`);
  });

program.parse();
