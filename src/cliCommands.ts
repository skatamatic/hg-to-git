import { writeFile } from "node:fs/promises";
import path from "node:path";
import { runConversionJob } from "./conversionJob.js";
import { checkToolchain } from "./deps/toolchain.js";
import { fixIgnoreCase, getIgnoreCaseStatus } from "./prerequisites.js";
import { getGitTargetStatus, resetGitTargetEmpty } from "./gitTarget.js";
import { getRepoSnapshotAsync } from "./repoSnapshotAsync.js";
import { parseOutputLine } from "./outputParser.js";
import { runValidateInWorker } from "./validateRunner.js";
import { defaultProjectFileName, serializeProjectFile } from "./projectFile.js";
import type { Project } from "./server/projects.js";
import {
  buildConvertRequest,
  cliContextFromProgram,
  requireRepoSource,
  resolveCliConfig,
  resolveSnapshotOptions,
  type CliConvertOptions,
  type CliRepoSourceOptions,
} from "./cliResolve.js";
import {
  CliWriter,
  cliExitCode,
  formatCliError,
  printConvertResult,
  printPreflight,
  printSyncSummary,
  printToolchain,
} from "./cliOutput.js";

function writerFromGlobals(globals: Record<string, unknown>): CliWriter {
  return new CliWriter(cliContextFromProgram(globals));
}

function fail(writer: CliWriter, message: string, json?: Record<string, unknown>): never {
  formatCliError(writer, message, json);
  cliExitCode(false);
}

export async function runToolsCommand(
  globals: Record<string, unknown>,
): Promise<void> {
  const writer = writerFromGlobals(globals);
  const report = checkToolchain();
  if (writer.opts.json) {
    writer.json(report);
    cliExitCode(report.ok);
  }
  writer.heading("hg-to-git tools");
  printToolchain(writer, report);
  cliExitCode(report.ok);
}

export async function runValidateCommand(
  opts: CliConvertOptions,
  globals: Record<string, unknown>,
): Promise<void> {
  const writer = writerFromGlobals(globals);
  requireRepoSource(opts);
  const body = await buildConvertRequest(opts);
  const result = await runValidateInWorker(body);

  if (writer.opts.json) {
    writer.json(result);
    cliExitCode(Boolean(result.ok));
  }

  writer.heading("hg-to-git validate");
  if (!result.ok) {
    fail(writer, String(result.error ?? "Validation failed"), { details: result });
  }

  const config = await resolveCliConfig(opts);
  printPreflight(writer, config, {
    ignoreCaseProblematic: Boolean(
      (result.ignoreCase as { problematic?: boolean } | undefined)?.problematic,
    ),
    targetProblematic: Boolean(
      (result.gitTarget as { problematic?: boolean } | undefined)?.problematic,
    ),
    foreignBranches: (
      result.gitTarget as { foreignBranches?: string[] } | undefined
    )?.foreignBranches,
  });

  if (result.versions) {
    writer.section("Versions");
    const versions = result.versions as Record<string, string>;
    for (const [key, value] of Object.entries(versions)) {
      writer.bullet(key, value);
    }
  }

  writer.success("Ready to convert.");
  cliExitCode(true);
}

export async function runStatusCommand(
  opts: CliConvertOptions,
  globals: Record<string, unknown>,
): Promise<void> {
  const writer = writerFromGlobals(globals);
  requireRepoSource(opts);
  const { hgRepo, gitRepo, snapshotOpts } = await resolveSnapshotOptions(opts);

  writer.heading("hg-to-git status");
  if (!writer.opts.json && !writer.opts.quiet) {
    writer.detail("Scanning repositories…");
  }

  const snapshot = await getRepoSnapshotAsync(
    hgRepo,
    gitRepo,
    snapshotOpts,
    (detail) => {
      if (writer.opts.verbose) writer.detail(detail);
    },
  );

  if (writer.opts.json) {
    writer.json({
      ok: true,
      hgRepo,
      gitRepo,
      snapshot,
    });
    cliExitCode(true);
  }

  printPreflight(writer, await resolveCliConfig(opts), {
    ignoreCaseProblematic: snapshot.git.ignoreCaseProblematic,
    targetProblematic: snapshot.git.targetProblematic,
    foreignBranches: snapshot.git.foreignBranches,
  });
  printSyncSummary(writer, snapshot.sync);

  if (writer.opts.verbose && snapshot.sync.branchDeltas.length > 0) {
    writer.section("Branch deltas");
    for (const delta of snapshot.sync.branchDeltas.slice(0, 40)) {
      writer.info(
        `${delta.name}: ${delta.status}` +
          (delta.gitBranch ? ` → ${delta.gitBranch}` : ""),
      );
    }
    if (snapshot.sync.branchDeltas.length > 40) {
      writer.detail(`… and ${snapshot.sync.branchDeltas.length - 40} more`);
    }
  }

  if (snapshot.sync.pendingChangesets.length > 0 && writer.opts.verbose) {
    writer.section("Pending changesets");
    for (const cs of snapshot.sync.pendingChangesets) {
      writer.info(`r${cs.rev} ${cs.branch}: ${cs.summary}`);
    }
  }

  cliExitCode(true);
}

export async function runConvertCommand(
  opts: CliConvertOptions & { dryRun?: boolean },
  globals: Record<string, unknown>,
): Promise<void> {
  const writer = writerFromGlobals(globals);
  requireRepoSource(opts);
  const body = await buildConvertRequest(opts);
  const config = await resolveCliConfig(opts);

  writer.heading("hg-to-git convert");
  printPreflight(writer, config, {
    ignoreCaseProblematic: getIgnoreCaseStatus(config.gitRepo).problematic,
    targetProblematic: getGitTargetStatus(config.gitRepo).problematic,
    foreignBranches: getGitTargetStatus(config.gitRepo).foreignBranches,
  });

  if (opts.dryRun) {
    const validation = await runValidateInWorker(body);
    if (writer.opts.json) {
      writer.json({ ok: Boolean(validation.ok), dryRun: true, validation });
      cliExitCode(Boolean(validation.ok));
    }
    if (!validation.ok) {
      fail(writer, String(validation.error ?? "Dry run failed"));
    }
    writer.success("Dry run OK — configuration and tools look good.");
    cliExitCode(true);
  }

  const logs: Record<string, unknown>[] = [];
  try {
    const { result } = await runConversionJob(body, (data) => {
      logs.push(data);
      const parsed = parseOutputLine(String(data.message ?? ""));
      if (parsed.message) {
        writer.logParsed(String(data.stream ?? "convert"), parsed);
      }
    });

    if (writer.opts.json) {
      writer.json({ ok: true, result, logs: writer.opts.verbose ? logs : undefined });
      cliExitCode(true);
    }

    printConvertResult(writer, result);
    cliExitCode(true);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    formatCliError(writer, message, { logs });
    cliExitCode(false);
  }
}

export async function runResetTargetCommand(
  opts: CliRepoSourceOptions & { force?: boolean },
  globals: Record<string, unknown>,
): Promise<void> {
  const writer = writerFromGlobals(globals);
  requireRepoSource(opts);
  const config = await resolveCliConfig(opts);

  if (!opts.force && !writer.opts.json && !writer.opts.quiet) {
    writer.warn(
      `This deletes ${path.join(config.gitRepo, ".git")} and re-initializes an empty repository.`,
    );
  }

  const status = resetGitTargetEmpty(config.gitRepo);
  if (writer.opts.json) {
    writer.json({ ok: true, gitRepo: config.gitRepo, gitTarget: status });
    cliExitCode(true);
  }
  writer.success(`Reset Git target at ${config.gitRepo}`);
  cliExitCode(true);
}

export async function runFixIgnoreCaseCommand(
  opts: CliRepoSourceOptions,
  globals: Record<string, unknown>,
): Promise<void> {
  const writer = writerFromGlobals(globals);
  requireRepoSource(opts);
  const config = await resolveCliConfig(opts);
  const status = fixIgnoreCase(config.gitRepo);

  if (writer.opts.json) {
    writer.json({ ok: true, ignoreCase: status });
    cliExitCode(true);
  }
  writer.success(`Set core.ignoreCase=false in ${config.gitRepo}`);
  cliExitCode(true);
}

export async function runInitConfigCommand(
  hgRepo: string,
  gitRepo: string,
  globals: Record<string, unknown>,
): Promise<void> {
  const writer = writerFromGlobals(globals);
  const git = path.resolve(gitRepo);
  const hg = path.resolve(hgRepo);
  const example = {
    hgRepo: hg,
    gitRepo: git,
    defaultBranch: "master",
    sanitizeNames: false,
    hgTags: true,
    repackAfterImport: true,
    authorsMap: "authors.map",
    branchesMap: null,
    tagsMap: null,
    checkoutWorkingTree: true,
  };
  const out = path.join(git, ".hg-to-git.json");
  await writeFile(out, JSON.stringify(example, null, 2) + "\n");
  if (writer.opts.json) {
    writer.json({ ok: true, path: out, config: example });
    cliExitCode(true);
  }
  writer.success(`Wrote ${out}`);
  cliExitCode(true);
}

export async function runInitProjectCommand(
  opts: {
    hgRepo: string;
    gitRepo: string;
    name?: string;
    output?: string;
    defaultBranch?: string;
    checkout?: boolean;
  },
  globals: Record<string, unknown>,
): Promise<void> {
  const writer = writerFromGlobals(globals);
  const hgRepo = path.resolve(opts.hgRepo);
  const gitRepo = path.resolve(opts.gitRepo);
  const name = opts.name?.trim() || path.basename(gitRepo) || "project";
  const project: Project = {
    id: "cli",
    name,
    hgRepo,
    gitRepo,
    defaultBranch: opts.defaultBranch?.trim() || "master",
    checkoutWorkingTree: opts.checkout ?? true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const out = path.resolve(
    opts.output?.trim() || path.join(gitRepo, defaultProjectFileName(name)),
  );
  await writeFile(out, serializeProjectFile(project), "utf8");
  if (writer.opts.json) {
    writer.json({ ok: true, path: out, project });
    cliExitCode(true);
  }
  writer.success(`Wrote project file ${out}`);
  cliExitCode(true);
}
