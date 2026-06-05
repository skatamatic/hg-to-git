import { parentPort, workerData } from "node:worker_threads";
import { runConversionJob } from "../conversionJob.js";

const body = workerData as Record<string, unknown>;

runConversionJob(body, (data) => {
  parentPort?.postMessage({ type: "log", data });
})
  .then(({ result }) => {
    parentPort?.postMessage({ type: "done", result });
  })
  .catch((e: unknown) => {
    parentPort?.postMessage({
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    });
  });
