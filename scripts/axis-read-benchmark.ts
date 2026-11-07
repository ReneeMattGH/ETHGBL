import nextEnv from "@next/env";
import { createHash } from "node:crypto";

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const { executeQuery, scanEntities, countEntities, TRANSFER_SELECT, transferOf } = await import("../src/lib/axis/store");
const { safeError } = await import("../src/lib/axis/runtime");
const { aggregateTransfers } = await import("../src/lib/axis/core");
const { MAX_SCOPE_ROWS } = await import("../src/lib/axis/model");
const datasetKey = process.argv[2];
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const originalFetch = globalThis.fetch;
let calls = 0, characters = 0, active = 0, peak = 0;
globalThis.fetch = async (...args) => {
  calls++; active++; peak = Math.max(peak, active);
  try {
    const response = await originalFetch(...args);
    characters += (await response.clone().text()).length;
    return response;
  } finally { active--; }
};
try {
  if (!datasetKey) throw new Error("Usage: npx.cmd tsx scripts/axis-read-benchmark.ts <dataset-key> [--verify]");
  for (const mode of ["page", "analytics"] as const) {
    calls = 0; characters = 0; peak = 0;
    const start = performance.now();
    const result = await executeQuery(datasetKey, {}, mode);
    console.log(JSON.stringify({ mode, ms: Math.round(performance.now() - start), rpcCalls: calls, responseCharacters: characters, peakParallel: peak, rows: result.total ?? result.scannedRows, block: result.blockNumber, ...(result.analytics ? { analyticsSha256: digest(result.analytics) } : {}) }));
    if (mode === "analytics" && process.argv.includes("--verify")) {
      // Re-read the exact frozen predicate sequentially to compare every aggregate.
      const predicate = result.executedQuery.replace(/ ORDER BY \$key:key ASC$/, "");
      const sequential = (await scanEntities(predicate, MAX_SCOPE_ROWS, { select: TRANSFER_SELECT })).map(transferOf);
      const latest = await countEntities(predicate);
      if (latest.count !== BigInt(sequential.length) || digest(aggregateTransfers(sequential)) !== digest(result.analytics)) throw new Error("Sequential and parallel results differ or source records changed during verification.");
      console.log(JSON.stringify({ verification: "exact aggregate match against a fresh sequential scan", rows: sequential.length }));
    }
  }
} catch (error) { console.error(safeError(error)); process.exitCode = 1; }
finally { globalThis.fetch = originalFetch; }
