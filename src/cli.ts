#!/usr/bin/env node
import { runCli } from "./cliMain.js";

const code = await runCli(process.argv);
process.exit(code);
