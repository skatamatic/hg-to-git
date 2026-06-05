import { Worker } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RepoSnapshot } from "./repoInfo.js";
import type { SnapshotOptions } from "./snapshotOptions.js";
import type { SnapshotProgressReporter } from "./snapshotProgress.js";

const workerFile = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "workers",
  "snapshotWorker.js",
);

type WorkerMessage =
  | { type: "progress"; detail: string }
  | { type: "done"; snapshot: RepoSnapshot }
  | { type: "error"; message: string };

export function getRepoSnapshotAsync(
  hgRepo: string,
  gitRepo: string,
  options: SnapshotOptions = {},
  onProgress?: SnapshotProgressReporter,
): Promise<RepoSnapshot> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerFile, {
      workerData: { hgRepo, gitRepo, options },
    });
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
      void worker.terminate();
    };

    worker.on("message", (msg: WorkerMessage) => {
      if (msg.type === "progress") {
        onProgress?.(msg.detail);
      } else if (msg.type === "done") {
        finish(() => resolve(msg.snapshot));
      } else if (msg.type === "error") {
        finish(() => reject(new Error(msg.message)));
      }
    });

    worker.once("error", (err) => {
      finish(() => reject(err));
    });

    worker.once("exit", (code) => {
      if (!settled && code !== 0) {
        settled = true;
        reject(new Error(`Snapshot worker exited with code ${code}`));
      }
    });
  });
}
