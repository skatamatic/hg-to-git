import { Worker } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workerFile = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "workers",
  "validateWorker.js",
);

export function runValidateInWorker(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerFile, { workerData: body });
    let settled = false;

    worker.once("message", (msg: Record<string, unknown>) => {
      settled = true;
      resolve(msg);
      void worker.terminate();
    });

    worker.once("error", (err) => {
      if (!settled) reject(err);
      void worker.terminate();
    });

    worker.once("exit", (code) => {
      if (!settled && code !== 0) {
        reject(new Error(`Validate worker exited with code ${code}`));
      }
    });
  });
}
