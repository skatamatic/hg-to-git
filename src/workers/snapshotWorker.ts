import { parentPort, workerData } from "node:worker_threads";
import { getRepoSnapshot } from "../repoInfo.js";
import type { SnapshotOptions } from "../snapshotOptions.js";

const { hgRepo, gitRepo, options } = workerData as {
  hgRepo: string;
  gitRepo: string;
  options?: SnapshotOptions;
};

try {
  const snapshot = getRepoSnapshot(
    hgRepo,
    gitRepo,
    options ?? {},
    (detail) => {
      parentPort?.postMessage({ type: "progress", detail });
    },
  );
  parentPort?.postMessage({ type: "done", snapshot });
} catch (e) {
  parentPort?.postMessage({
    type: "error",
    message: e instanceof Error ? e.message : String(e),
  });
}
