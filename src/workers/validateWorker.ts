import { parentPort, workerData } from "node:worker_threads";
import { loadConfig } from "../config.js";
import {
  assertGitRepo,
  assertHgRepo,
  detectVersions,
  getIgnoreCaseStatus,
} from "../prerequisites.js";
import { getGitTargetStatus } from "../gitTarget.js";

const body = workerData as Record<string, unknown>;

(async () => {
  try {
    const config = await loadConfig(undefined, body);
    const ignoreCase = getIgnoreCaseStatus(config.gitRepo);
    const gitTarget = getGitTargetStatus(config.gitRepo);

    if (ignoreCase.problematic && !config.force) {
      parentPort?.postMessage({
        ok: false,
        error: ignoreCase.message,
        ignoreCase,
        gitTarget,
      });
      return;
    }

    if (gitTarget.problematic && !config.force) {
      parentPort?.postMessage({
        ok: false,
        error: gitTarget.message,
        ignoreCase,
        gitTarget,
      });
      return;
    }

    assertHgRepo(config.hgRepo);
    assertGitRepo(config.gitRepo);
    const versions = detectVersions(
      config.gitRepo,
      config.hgRepo,
      config.python,
    );
    parentPort?.postMessage({ ok: true, versions, ignoreCase, gitTarget });
  } catch (e) {
    parentPort?.postMessage({ ok: false, error: String(e) });
  }
})();
