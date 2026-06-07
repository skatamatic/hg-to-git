#!/usr/bin/env node
/**
 * npm bin entry — delegates to the compiled CLI in dist/.
 * Keeps `hg-to-git` working when installed globally or via npx.
 */
import "../dist/cli.js";
