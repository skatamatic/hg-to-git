import type { Command } from "commander";
import { colorEnabled, paint, ANSI } from "./cliColors.js";

export interface CliHelpOptions {
  color?: boolean;
  quiet?: boolean;
}

function padEnd(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

export function shouldShowRootHelp(argv: string[]): boolean {
  const args = argv.slice(2);
  if (args.length === 0) return true;
  if (args[0] === "help" && args.length === 1) return true;
  const positionals = args.filter((a) => !a.startsWith("-"));
  const hasHelpFlag = args.some((a) => a === "-h" || a === "--help");
  return positionals.length === 0 && hasHelpFlag;
}

export function helpColorFromArgv(argv: string[]): boolean {
  if (argv.includes("--no-color")) return false;
  return colorEnabled({});
}

export function renderCliHelp(program: Command, opts: CliHelpOptions = {}): string {
  const useColor = opts.color !== false && colorEnabled({});
  const lines: string[] = [];

  const title = paint(useColor, ANSI.bold + ANSI.cyan, program.name());
  const version = program.version() ? paint(useColor, ANSI.dim, ` v${program.version()}`) : "";
  lines.push(`${title}${version}`);
  lines.push(paint(useColor, ANSI.dim, program.description()));
  lines.push("");

  lines.push(paint(useColor, ANSI.bold, "Usage"));
  lines.push(
    `  ${paint(useColor, ANSI.cyan, program.name())} ${paint(useColor, ANSI.yellow, "[options]")} ${paint(useColor, ANSI.cyan, "<command>")} ${paint(useColor, ANSI.dim, "[command-options]")}`,
  );
  lines.push("");

  lines.push(paint(useColor, ANSI.bold, "Global options"));
  for (const opt of [
    ["-h, --help", "Show this help"],
    ["-V, --version", "Print version"],
    ["--json", "Machine-readable JSON on stdout"],
    ["-q, --quiet", "Minimal output"],
    ["-v, --verbose", "Extra detail (logs, branch deltas)"],
    ["--no-color", "Disable ANSI colors"],
  ]) {
    lines.push(`  ${paint(useColor, ANSI.yellow, padEnd(opt[0], 22))} ${paint(useColor, ANSI.dim, opt[1])}`);
  }
  lines.push("");

  lines.push(paint(useColor, ANSI.bold, "Commands"));
  const commands = program.commands.filter((c) => c.name() !== "help");
  const nameWidth = Math.max(
    14,
    ...commands.map((c) => {
      const aliases = c.aliases();
      const names = aliases.length ? `${c.name()}, ${aliases.join(", ")}` : c.name();
      return names.length;
    }),
  );
  for (const cmd of commands) {
    const aliases = cmd.aliases();
    const names = aliases.length ? `${cmd.name()}, ${aliases.join(", ")}` : cmd.name();
    lines.push(
      `  ${paint(useColor, ANSI.cyan, padEnd(names, nameWidth))} ${cmd.description()}`,
    );
  }
  lines.push("");

  lines.push(paint(useColor, ANSI.bold, "Repo source"));
  lines.push(
    paint(
      useColor,
      ANSI.dim,
      "  Point at repos using one of: --project <file> · --hg-repo + --git-repo · --git-repo with .hg-to-git.json",
    ),
  );
  lines.push("");

  lines.push(paint(useColor, ANSI.bold, "Quick start"));
  const ex = (cmd: string) => paint(useColor, ANSI.cyan, cmd);
  lines.push(`  ${ex("hg-to-git tools")}`);
  lines.push(
    `  ${ex("hg-to-git status --hg-repo ./hg --git-repo ./git")}`,
  );
  lines.push(
    `  ${ex("hg-to-git convert --hg-repo ./hg --git-repo ./git --checkout")}`,
  );
  lines.push(
    `  ${ex("hg-to-git convert -p MyProject.hg-to-git-project.json")}`,
  );
  lines.push("");

  lines.push(
    paint(
      useColor,
      ANSI.dim,
      `Run ${paint(useColor, ANSI.cyan, "hg-to-git <command> --help")} for command-specific options.`,
    ),
  );

  return lines.join("\n");
}

export function printCliHelp(program: Command, opts: CliHelpOptions = {}): void {
  if (opts.quiet) return;
  process.stdout.write(renderCliHelp(program, opts) + "\n");
}
