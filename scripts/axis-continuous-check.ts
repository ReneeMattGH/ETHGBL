import nextEnv from "@next/env";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http, type Hex } from "viem";
import { u64 } from "@arkiv-network/sdk/schema";
nextEnv.loadEnvConfig(process.cwd());
const { arkivEndpoint, safeError } = await import("../src/lib/axis/runtime");
const { DatasetSchema } = await import("../src/lib/axis/schemas");
const { getDataset, coverageSummary, executeQuery } = await import("../src/lib/axis/store");
const { extractRange } = await import("../src/lib/axis/polygon");
const { aggregateTransfers } = await import("../src/lib/axis/core");
const { writeState } = await import("../src/lib/axis/queue");
const evidence = JSON.parse(readFileSync(".axis/browser-evidence.json", "utf8"));
const account = privateKeyToAccount(parseEnv(readFileSync(".env.browser-test.local", "utf8")).AXIS_TEST_PRIVATE_KEY as Hex);
const wallet = createWalletClient({ account, chain: rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" }), transport: http(arkivEndpoint(), { retryCount: 0, timeout: 30000 }) });
try {
  const dataset = await getDataset(evidence.datasetKey), target = BigInt(dataset.endBlock) + 2n;
  await wallet.patchEntity(DatasetSchema, evidence.datasetKey, { set: { continuous: true, endBlock: u64(target) } });
  console.log(JSON.stringify({ check: "owner enabled automatic incremental ingestion", target: target.toString() }));
  let complete = false;
  for (let index = 0; index < 36; index++) {
    const summary = await coverageSummary(await getDataset(evidence.datasetKey));
    if (summary.complete && summary.throughBlock === target.toString()) { complete = true; break; }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  if (!complete) throw new Error("Worker did not automatically complete the extended range within three minutes.");
  const source = await extractRange(dataset.startBlock, target.toString()), actual = await executeQuery(dataset.key, {}, "analytics"), expected = aggregateTransfers(source.rows);
  if (!("analytics" in actual) || actual.analytics.amountRaw !== expected.amountRaw || actual.analytics.transfers !== expected.transfers) throw new Error("Automatically extended analytics do not match the Polygon source.");
  await wallet.patchEntity(DatasetSchema, evidence.datasetKey, { set: { continuous: false } });
  const result = { check: "automatic incremental ingestion and exact analytics", passed: true, datasetKey: dataset.key, throughBlock: target.toString(), transfers: expected.transfers, amountRaw: expected.amountRaw };
  await writeState("continuous-evidence", result); console.log(JSON.stringify(result));
} catch (error) {
  try { await wallet.patchEntity(DatasetSchema, evidence.datasetKey, { set: { continuous: false } }); } catch {}
  console.log(JSON.stringify({ check: "automatic incremental ingestion", passed: false, error: safeError(error) })); process.exitCode = 1;
}
