import { describe, expect, it } from "vitest";
import { CliWriter, colorEnabled, formatCliError } from "./cliOutput.js";

describe("cliOutput", () => {
  it("disables color when json mode is on", () => {
    expect(colorEnabled({ json: true, color: true })).toBe(false);
  });

  it("respects explicit no-color", () => {
    expect(colorEnabled({ color: false })).toBe(false);
  });

  it("exposes writer options", () => {
    const writer = new CliWriter({ quiet: true, verbose: false });
    expect(writer.opts.quiet).toBe(true);
    expect(writer.useColor).toBe(false);
  });

  it("formatCliError writes json payload", () => {
    const writer = new CliWriter({ json: true });
    let out = "";
    const orig = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      out += String(chunk);
      return true;
    }) as typeof process.stdout.write;
    try {
      formatCliError(writer, "boom", { code: 1 });
      expect(JSON.parse(out)).toMatchObject({ ok: false, error: "boom", code: 1 });
    } finally {
      process.stdout.write = orig;
    }
  });
});
