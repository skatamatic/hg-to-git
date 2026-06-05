import { Worker } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ConversionLogHandler } from "./conversionJob.js";
import type { ConvertResult } from "./fastExport.js";

const workerFile = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "workers",
  "convertWorker.js",
);

type WorkerOutMessage =
  | { type: "log"; data: Record<string, unknown> }
  | { type: "done"; result: ConvertResult }
  | { type: "error"; message: string };

export function runConversionInWorker(
  body: Record<string, unknown>,
  onLog: ConversionLogHandler,
): Promise<{ result: ConvertResult }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerFile, { workerData: body });
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
      void worker.terminate();
    };

    worker.on("message", (msg: WorkerOutMessage) => {
      if (msg.type === "log") {
        onLog(msg.data);
      } else if (msg.type === "done") {
        finish(() => resolve({ result: msg.result }));
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
        reject(new Error(`Conversion worker exited with code ${code}`));
      }
    });
  });
}
