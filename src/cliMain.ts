import { Command } from "commander";
import {
  runConvertCommand,
  runFixIgnoreCaseCommand,
  runInitConfigCommand,
  runInitProjectCommand,
  runResetTargetCommand,
  runStatusCommand,
  runToolsCommand,
  runValidateCommand,
} from "./cliCommands.js";
import {
  helpColorFromArgv,
  printCliHelp,
  shouldShowRootHelp,
} from "./cliHelp.js";
import { CliWriter, formatCliError } from "./cliOutput.js";

const CLI_MODE_FLAG = "--cli";

export function isPackagedCliInvocation(argv: string[]): boolean {
  if (process.env.HG_TO_GIT_CLI === "1") return true;
  return argv.includes(CLI_MODE_FLAG);
}

function isCliScriptArg(arg: string | undefined): boolean {
  if (!arg) return false;
  return /(?:^|[/\\])cli\.js$/i.test(arg) || /hg-to-git(?:\.js)?$/i.test(arg);
}

/** Prepare argv for Commander (`[runtime, script, ...userArgs]`). */
export function prepareArgvForParse(argv: string[]): string[] {
  const withoutCli = argv.filter((a) => a !== CLI_MODE_FLAG);
  if (isCliScriptArg(withoutCli[1])) {
    return withoutCli;
  }
  const runtime = withoutCli[0] ?? process.execPath;
  return [runtime, "hg-to-git", ...withoutCli.slice(1)];
}

/** @deprecated alias */
export function normalizeCliArgv(argv: string[]): string[] {
  return prepareArgvForParse(argv);
}

function addRepoSourceOptions(cmd: Command): Command {
  return cmd
    .option("-p, --project <path>", "Project file (.hg-to-git-project.json)")
    .option(
      "-c, --config <path>",
      "Path to .hg-to-git.json in or beside the Git repo",
    )
    .option("--hg-repo <path>", "Mercurial repository path")
    .option("--git-repo <path>", "Git repository path");
}

function addConvertOptions(cmd: Command): Command {
  return cmd
    .option("--authors-map <path>", "Author identity mapping file")
    .option("--branches-map <path>", "Branch rename mapping file")
    .option("--tags-map <path>", "Tag rename mapping file")
    .option("-M, --default-branch <name>", "Git name for hg default branch")
    .option("-e, --encoding <enc>", "Commit/author encoding")
    .option("--fe <enc>", "Filename encoding")
    .option("--sanitize", "Enable hg-fast-export branch/tag sanitization")
    .option("--no-sanitize", "Disable branch/tag name sanitization")
    .option("--hgtags", "Export .hgtags (default)")
    .option("--no-hgtags", "Do not export .hgtags")
    .option("-s, --signed-off-by", "Use Signed-off-by for author")
    .option("--ignore-unnamed-heads", "Skip unnamed heads (default)")
    .option("--no-ignore-unnamed-heads", "Do not skip unnamed heads")
    .option(
      "-f, --force",
      "Ignore validation errors (risky on non-empty Git targets)",
    )
    .option("-m, --max-revision <n>", "Max hg revision", (v) => parseInt(v, 10))
    .option("--repack", "Run git gc after import (default)")
    .option("--no-repack", "Skip git gc after import")
    .option(
      "--checkout",
      "Check out the default branch after import (working tree)",
    )
    .option("--no-checkout", "Do not check out after import")
    .option("--fast-export <path>", "Path to fast-export checkout")
    .option("--python <exe>", "Python executable with mercurial module");
}

function mapConvertOpts(opts: Record<string, unknown>) {
  const sanitizeNames = opts.sanitize
    ? true
    : opts.noSanitize
      ? false
      : undefined;
  const hgTags =
    opts.hgtags === true ? true : opts.noHgtags ? false : undefined;
  const repackAfterImport =
    opts.repack === true ? true : opts.noRepack ? false : undefined;
  const checkoutWorkingTree =
    opts.checkout === true ? true : opts.noCheckout ? false : undefined;
  const ignoreUnnamedHeads =
    opts.ignoreUnnamedHeads === true
      ? true
      : opts.noIgnoreUnnamedHeads
        ? false
        : undefined;

  return {
    project: opts.project as string | undefined,
    config: opts.config as string | undefined,
    hgRepo: opts.hgRepo as string | undefined,
    gitRepo: opts.gitRepo as string | undefined,
    authorsMap: opts.authorsMap as string | undefined,
    branchesMap: opts.branchesMap as string | undefined,
    tagsMap: opts.tagsMap as string | undefined,
    defaultBranch: opts.defaultBranch as string | undefined,
    encoding: opts.encoding as string | undefined,
    fileEncoding: opts.fe as string | undefined,
    sanitizeNames,
    hgTags,
    signedOffBy: opts.signedOffBy as boolean | undefined,
    ignoreUnnamedHeads,
    force: opts.force as boolean | undefined,
    maxRevision: opts.maxRevision as number | undefined,
    repackAfterImport,
    checkoutWorkingTree,
    fastExportPath: opts.fastExport as string | undefined,
    python: opts.python as string | undefined,
  };
}

export function createCliProgram(): Command {
  const program = new Command();

  program
    .name("hg-to-git")
    .description(
      "Convert Mercurial repositories to Git using hg-fast-export (headless CLI and incremental sync)",
    )
    .version("1.0.0")
    .option("--json", "Machine-readable JSON on stdout")
    .option("-q, --quiet", "Minimal output (errors and final result only)")
    .option(
      "-v, --verbose",
      "Extra detail (branch deltas, snapshot progress, logs)",
    )
    .option("--no-color", "Disable ANSI colors");

  function globals(): Record<string, unknown> {
    const g = program.opts();
    return {
      json: g.json,
      quiet: g.quiet,
      verbose: g.verbose,
      color: g.color,
    };
  }

  const convertCmd = addConvertOptions(
    addRepoSourceOptions(new Command("convert")),
  )
    .description("Import or incrementally sync hg history into a git repository")
    .option("--dry-run", "Validate tools and configuration only")
    .action(async (opts) => {
      await runConvertCommand(
        { ...mapConvertOpts(opts), dryRun: Boolean(opts.dryRun) },
        globals(),
      );
    });

  convertCmd.alias("run");
  program.addCommand(convertCmd);

  addConvertOptions(addRepoSourceOptions(program.command("status")))
    .description("Show sync status between Mercurial and Git")
    .action(async (opts) => {
      await runStatusCommand(mapConvertOpts(opts), globals());
    });

  addConvertOptions(addRepoSourceOptions(program.command("validate")))
    .description("Check tools, repos, and pre-flight conditions")
    .action(async (opts) => {
      await runValidateCommand(mapConvertOpts(opts), globals());
    });

  addRepoSourceOptions(program.command("reset-target"))
    .description("Delete .git and re-initialize an empty Git repository")
    .option("-f, --force", "Skip confirmation hint")
    .action(async (opts) => {
      await runResetTargetCommand(
        {
          project: opts.project,
          config: opts.config,
          hgRepo: opts.hgRepo,
          gitRepo: opts.gitRepo,
          force: opts.force,
        },
        globals(),
      );
    });

  addRepoSourceOptions(program.command("fix-ignore-case"))
    .description("Set core.ignoreCase=false on the Git target")
    .action(async (opts) => {
      await runFixIgnoreCaseCommand(
        {
          project: opts.project,
          config: opts.config,
          hgRepo: opts.hgRepo,
          gitRepo: opts.gitRepo,
        },
        globals(),
      );
    });

  program
    .command("tools")
    .description("Check availability of git, hg, python, and mercurial")
    .action(async () => {
      await runToolsCommand(globals());
    });

  program
    .command("init-config")
    .description("Write an example .hg-to-git.json in the git repo")
    .requiredOption("--git-repo <path>", "Git repository path")
    .requiredOption("--hg-repo <path>", "Mercurial repository path")
    .action(async (opts) => {
      await runInitConfigCommand(opts.hgRepo, opts.gitRepo, globals());
    });

  program
    .command("init-project")
    .description("Write a .hg-to-git-project.json project file")
    .requiredOption("--hg-repo <path>", "Mercurial repository path")
    .requiredOption("--git-repo <path>", "Git repository path")
    .option("--name <name>", "Project display name")
    .option("-o, --output <path>", "Output file path")
    .option("-M, --default-branch <name>", "Main Git branch name", "master")
    .option("--checkout", "Enable checkout when conversion finishes", true)
    .option("--no-checkout", "Disable checkout after conversion")
    .action(async (opts) => {
      await runInitProjectCommand(
        {
          hgRepo: opts.hgRepo,
          gitRepo: opts.gitRepo,
          name: opts.name,
          output: opts.output,
          defaultBranch: opts.defaultBranch,
          checkout: opts.checkout,
        },
        globals(),
      );
    });

  return program;
}

/** Run the CLI; returns a process exit code. */
export async function runCli(argv: string[]): Promise<number> {
  const program = createCliProgram();
  const normalized = prepareArgvForParse(argv);

  if (shouldShowRootHelp(normalized)) {
    printCliHelp(program, { color: helpColorFromArgv(normalized) });
    return 0;
  }

  try {
    await program.parseAsync(normalized);
    return 0;
  } catch (err) {
    const g = program.opts();
    const writer = new CliWriter({
      json: Boolean(g.json),
      quiet: Boolean(g.quiet),
      verbose: Boolean(g.verbose),
      color: g.color,
    });
    const message = err instanceof Error ? err.message : String(err);
    formatCliError(writer, message);
    return 1;
  }
}
