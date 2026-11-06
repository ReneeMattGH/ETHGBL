import nextEnv from "@next/env";
import { existsSync } from "node:fs";
nextEnv.loadEnvConfig(process.cwd());
if (existsSync(".env.worker.local")) process.loadEnvFile(".env.worker.local");
const { runJob } = await import("../src/lib/axis/ingestor");
const { listDatasets, coverageSummary } = await import("../src/lib/axis/store");
const { finalizedBlock } = await import("../src/lib/axis/polygon");
const { readState, writeState, withLock, enqueue } = await import("../src/lib/axis/queue");
const { safeError, workerWriter, arkivReader } = await import("../src/lib/axis/runtime");
import type { Job } from "../src/lib/axis/model";

let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
const log = (event: string, data: object = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), event, ...data }));
const once = process.argv.includes("--once");
let lastRenew = 0;
const tick = async () => {
  await writeState("heartbeat", { at: new Date().toISOString(), pid: process.pid });
  const writer = workerWriter();
  if ((await arkivReader().getBalance({ address: writer.account.address })) === 0n) throw new Error("The worker has no test tGLM.");
  const jobs = await readState<Job[]>("jobs", []);
  const next = jobs.find(job => !["complete", "failed"].includes(job.stage));
  if (next) {
    log("job.started", { id: next.id, dataset: next.datasetKey });
    try { const result = await runJob(next); log("job.complete", { id: result.id, writes: result.processed, duplicates: result.duplicates, transactions: result.txHashes.length }); }
    catch (error) { log("job.failed", { id: next.id, error: safeError(error) }); }
    return;
  }
  if (!once) {
    if (Date.now() - lastRenew > 21600000) { const { renewWorkerEntities } = await import("../src/lib/axis/renew"); log("retention.checked", await renewWorkerEntities()); lastRenew = Date.now(); }
    const datasets = (await listDatasets()).filter(dataset => dataset.enabled && dataset.continuous);
    const finalized = datasets.length ? await finalizedBlock() : null;
    for (const dataset of datasets) {
      const failed = jobs.findLast(job => job.datasetKey === dataset.key && job.stage === "failed");
      if (failed && Date.now() - Date.parse(failed.updatedAt) < 60000) continue;
      const summary = await coverageSummary(dataset);
      if (summary.gaps.length) continue;
      const start = summary.throughBlock ? BigInt(summary.throughBlock) + 1n : BigInt(dataset.startBlock);
      const ceiling = dataset.endBlock === "0" ? finalized!.number! : BigInt(dataset.endBlock);
      const chunkEnd = start + BigInt(dataset.chunkBlocks ?? 10) - 1n;
      const end = chunkEnd < ceiling ? chunkEnd : ceiling;
      if (start <= end && end <= finalized!.number!) await enqueue(dataset.key, dataset.owner, start.toString(), end.toString());
    }
  }
};
try {
  await withLock("worker", async () => {
    log("worker.ready");
    const beat = setInterval(() => { void writeState("heartbeat", { at: new Date().toISOString(), pid: process.pid }).catch(() => {}); }, 10000);
    try { while (!stopping) { try { await tick(); } catch (error) { log("worker.error", { error: safeError(error) }); } if (once) break; for (let index = 0; index < 20 && !stopping; index++) await new Promise(resolve => setTimeout(resolve, 500)); } } finally { clearInterval(beat); }
  }, 1);
} catch (error) { log("worker.stopped", { error: safeError(error) }); process.exitCode = 1; }
await writeState("heartbeat", { at: new Date(0).toISOString(), pid: process.pid });
