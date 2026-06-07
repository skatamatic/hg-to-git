import type { ParsedLogLine } from "./outputParser.js";
import type { RepoSyncInfo, SyncStatusKind } from "./repoSync.js";
import type { ToolchainReport } from "./deps/toolchain.js";
import type { HgToGitConfig } from "./config.js";
import type { ConvertResult } from "./fastExport.js";
import { ANSI, badge, colorEnabled, paint } from "./cliColors.js";

export interface CliOutputOptions {
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  color?: boolean;
}

export { colorEnabled };

export class CliWriter {
  readonly useColor: boolean;
  readonly opts: CliOutputOptions;
  private lastProgressLen = 0;

  constructor(opts: CliOutputOptions) {
    this.opts = opts;
    this.useColor = colorEnabled(opts);
  }

  json(data: unknown): void {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  }

  line(text = ""): void {
    if (this.opts.json) return;
    process.stdout.write(text + "\n");
  }

  blank(): void {
    this.line();
  }

  err(text: string): void {
    if (this.opts.json) return;
    process.stderr.write(text + "\n");
  }

  heading(text: string): void {
    if (this.opts.quiet || this.opts.json) return;
    this.clearProgress();
    this.blank();
    this.line(paint(this.useColor, ANSI.bold + ANSI.cyan, text));
  }

  section(text: string): void {
    if (this.opts.quiet || this.opts.json) return;
    this.line(paint(this.useColor, ANSI.bold + ANSI.white, text));
  }

  info(text: string): void {
    if (this.opts.quiet || this.opts.json) return;
    this.line(`  ${text}`);
  }

  detail(text: string): void {
    if (this.opts.json) return;
    if (!this.opts.verbose && this.opts.quiet) return;
    this.line(paint(this.useColor, ANSI.dim, `  ${text}`));
  }

  success(text: string): void {
    if (this.opts.json) return;
    this.clearProgress();
    const prefix = badge(this.useColor, "OK", "ok");
    this.line(this.opts.quiet ? text : `${prefix}  ${text}`);
  }

  warn(text: string): void {
    if (this.opts.json) return;
    this.clearProgress();
    const prefix = badge(this.useColor, "WARN", "warn");
    this.line(`${prefix}  ${text}`);
  }

  error(text: string): void {
    if (this.opts.json) return;
    this.clearProgress();
    const prefix = badge(this.useColor, "ERROR", "error");
    const parts = text.split(/\r?\n/);
    process.stderr.write(`${prefix}  ${parts[0]}\n`);
    for (let i = 1; i < parts.length; i++) {
      process.stderr.write(
        paint(this.useColor, ANSI.dim, "       ") + parts[i] + "\n",
      );
    }
  }

  bullet(label: string, value: string): void {
    if (this.opts.quiet || this.opts.json) return;
    this.line(
      `  ${paint(this.useColor, ANSI.dim, label.padEnd(16))} ${value}`,
    );
  }

  progress(label: string, percent: number): void {
    if (this.opts.json || this.opts.quiet) return;
    const width = 24;
    const clamped = Math.max(0, Math.min(100, percent));
    const filled = Math.round((clamped / 100) * width);
    const empty = width - filled;
    const barFilled = paint(this.useColor, ANSI.cyan, "█".repeat(filled));
    const barEmpty = paint(this.useColor, ANSI.dim, "░".repeat(empty));
    const pct = paint(
      this.useColor,
      ANSI.bold + ANSI.white,
      `${String(clamped).padStart(3)}%`,
    );
    const text = `${barFilled}${barEmpty} ${pct} ${paint(this.useColor, ANSI.dim, label)}`;
    const padded = text.padEnd(Math.max(this.lastProgressLen, text.length), " ");
    this.lastProgressLen = padded.length;
    process.stderr.write(`\r${padded}`);
  }

  clearProgress(): void {
    if (this.lastProgressLen > 0) {
      process.stderr.write("\r" + " ".repeat(this.lastProgressLen) + "\r");
      this.lastProgressLen = 0;
    }
  }

  logParsed(stream: string, parsed: ParsedLogLine): void {
    if (this.opts.json || this.opts.quiet) return;

    if (parsed.level === "progress" && parsed.revisionMax != null) {
      const pct = Math.min(
        100,
        Math.round((parsed.revisionCurrent! / parsed.revisionMax) * 100),
      );
      const branch = parsed.branch ? ` · ${parsed.branch}` : "";
      this.progress(
        `rev ${parsed.revisionCurrent}/${parsed.revisionMax}${branch}`,
        pct,
      );
      return;
    }

    if (
      parsed.level === "progress" &&
      parsed.filesMax != null &&
      parsed.filesCurrent != null
    ) {
      const pct = Math.min(
        100,
        Math.round((parsed.filesCurrent / parsed.filesMax) * 100),
      );
      this.progress(`files ${parsed.filesCurrent}/${parsed.filesMax}`, pct);
      return;
    }

    if (parsed.level === "progress" && !this.opts.verbose) return;

    const streamTag = paint(this.useColor, ANSI.gray, `[${stream}]`);
    const levelTag =
      parsed.level === "error"
        ? badge(this.useColor, "ERROR", "error")
        : parsed.level === "warn"
          ? badge(this.useColor, "WARN", "warn")
          : parsed.level === "success"
            ? badge(this.useColor, "OK", "ok")
            : parsed.level === "progress"
              ? badge(this.useColor, "PROGRESS", "info")
              : badge(this.useColor, "INFO", "muted");
    this.err(`${streamTag} ${levelTag}  ${parsed.message}`);
  }
}

function syncTone(status: SyncStatusKind): "ok" | "warn" | "error" | "info" {
  switch (status) {
    case "in_sync":
      return "ok";
    case "behind":
    case "never_imported":
      return "warn";
    case "ahead":
    case "repo_mismatch":
    case "hg_missing":
    case "git_missing":
      return "error";
    default:
      return "info";
  }
}

export function printToolchain(
  writer: CliWriter,
  report: ToolchainReport,
): void {
  writer.section("Toolchain");
  for (const tool of report.tools) {
    const status = tool.installed
      ? badge(writer.useColor, "ok", "ok")
      : badge(writer.useColor, "missing", "error");
    const version = tool.version
      ? paint(writer.useColor, ANSI.dim, ` ${tool.version}`)
      : "";
    writer.info(`${tool.name.padEnd(12)} ${status}${version}`);
    if (!tool.installed && tool.detail) writer.detail(tool.detail);
  }
  if (!report.ok && report.installerNote) {
    writer.detail(report.installerNote);
  }
}

export function printPreflight(
  writer: CliWriter,
  config: HgToGitConfig,
  extra?: {
    ignoreCaseProblematic?: boolean;
    targetProblematic?: boolean;
    foreignBranches?: string[];
  },
): void {
  writer.section("Repositories");
  writer.bullet("Mercurial", config.hgRepo);
  writer.bullet("Git", config.gitRepo);
  writer.bullet("Default branch", config.defaultBranch ?? "master");
  if (extra?.ignoreCaseProblematic) {
    writer.warn("Git core.ignoreCase is true — rename fidelity may suffer.");
  }
  if (extra?.targetProblematic) {
    const branches = extra.foreignBranches?.length
      ? extra.foreignBranches.join(", ")
      : "existing commits";
    writer.warn(
      `Git target is not empty (${branches}). Use reset-target to start fresh, or --force for a risky run.`,
    );
  }
}

export function printSyncSummary(writer: CliWriter, sync: RepoSyncInfo): void {
  writer.section("Sync status");
  const tone = syncTone(sync.status);
  writer.info(
    `${badge(writer.useColor, sync.status.replace(/_/g, " "), tone)}  ${sync.title}`,
  );
  writer.info(paint(writer.useColor, ANSI.dim, `  ${sync.summary}`));
  if (sync.hgChangesetCount > 0) {
    const pctLabel = paint(
      writer.useColor,
      sync.syncPercent >= 100 ? ANSI.green : ANSI.yellow,
      `${sync.syncPercent}%`,
    );
    writer.bullet(
      "Progress",
      `${pctLabel} (${sync.importedTip}/${sync.hgChangesetCount} changesets)`,
    );
  }
  if (sync.pendingRevisions > 0) {
    writer.bullet(
      "Pending",
      paint(
        writer.useColor,
        ANSI.yellow,
        `${sync.pendingRevisions} revision(s)`,
      ),
    );
  }
  if (sync.branchDeltas.length > 0 && !writer.opts.quiet) {
    const mismatches = sync.branchDeltas.filter((b) => b.status !== "synced");
    if (mismatches.length > 0) {
      writer.detail(
        `${mismatches.length} branch mismatch(es) — use --verbose or --json for details`,
      );
    }
  }
}

export function printConvertResult(
  writer: CliWriter,
  result: ConvertResult,
): void {
  writer.clearProgress();
  writer.blank();
  if (result.incremental) {
    writer.success(
      `Incremental import complete — ${result.revisionsImported} new revision(s).`,
    );
  } else {
    writer.success(
      `Initial import complete — ${result.revisionsImported} revision(s) in this run.`,
    );
  }
  writer.bullet("State directory", result.gitDir);
  writer.bullet("State files", result.stateFiles.join(", "));
  writer.detail("Re-run the same command after pulling new hg commits to sync.");
}

export function cliExitCode(ok: boolean): never {
  process.exit(ok ? 0 : 1);
}

export function formatCliError(
  writer: CliWriter,
  message: string,
  json?: Record<string, unknown>,
): void {
  if (writer.opts.json) {
    writer.json({ ok: false, error: message, ...json });
  } else {
    writer.error(message);
  }
}
