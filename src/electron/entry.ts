/**
 * Electron entry: GUI by default, headless CLI when invoked with `--cli`.
 * Packaged installs ship `hg-to-git-cli.cmd` beside the app that passes `--cli`.
 */
import { isPackagedCliInvocation, runCli } from "../cliMain.js";

if (isPackagedCliInvocation(process.argv)) {
  const code = await runCli(process.argv);
  process.exit(code);
}

await import("./main.js");
