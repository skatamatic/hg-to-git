export const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  white: "\x1b[37m",
} as const;

export interface ColorContext {
  json?: boolean;
  quiet?: boolean;
  color?: boolean;
}

export function colorEnabled(opts: ColorContext): boolean {
  if (opts.json || opts.quiet) return false;
  if (opts.color === false) return false;
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR === "1" || process.env.FORCE_COLOR === "true") {
    return true;
  }
  return Boolean(process.stderr.isTTY || process.stdout.isTTY);
}

export function paint(enabled: boolean, code: string, text: string): string {
  return enabled ? `${code}${text}${ANSI.reset}` : text;
}

export function badge(
  enabled: boolean,
  label: string,
  tone: "ok" | "warn" | "error" | "info" | "muted",
): string {
  const tones: Record<typeof tone, string> = {
    ok: ANSI.green,
    warn: ANSI.yellow,
    error: ANSI.red,
    info: ANSI.cyan,
    muted: ANSI.gray,
  };
  const code = tones[tone];
  return paint(enabled, code + ANSI.bold, label);
}
