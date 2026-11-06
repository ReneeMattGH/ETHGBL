import nextEnv from "@next/env";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { addr, u64 } from "@arkiv-network/sdk/schema";
import { http, parseEther, stringToBytes, type Hex } from "viem";
nextEnv.loadEnvConfig(process.cwd());
process.loadEnvFile(".env.worker.local");
const { arkivEndpoint, arkivReader, workerWriter, writerAddress, safeError } = await import("../src/lib/axis/runtime");
const { DatasetSchema, DashboardSchema } = await import("../src/lib/axis/schemas");
const { getDataset, coverageSummary, executeQuery, getDashboard, getEntity, listDashboards } = await import("../src/lib/axis/store");
const { finalizedBlock, extractRange } = await import("../src/lib/axis/polygon");
const { runJob } = await import("../src/lib/axis/ingestor");
const { enqueue, withLock, writeState, readState } = await import("../src/lib/axis/queue");
const { aggregateTransfers } = await import("../src/lib/axis/core");
const { USDC } = await import("../src/lib/axis/model");
import type { DashboardDocument, Job } from "../src/lib/axis/model";
const results: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: string) => { results.push({ name, ok, detail }); console.log(JSON.stringify({ check: name, ok, detail })); if (!ok) throw new Error(name); };
try {
  const envPath = ".env.browser-test.local";
  if (!existsSync(envPath)) writeFileSync(envPath, "# Local integration-test signer. Never share this key.\nAXIS_TEST_PRIVATE_KEY=" + generatePrivateKey() + "\n", { mode: 0o600 });
  const account = privateKeyToAccount(parseEnv(readFileSync(envPath, "utf8")).AXIS_TEST_PRIVATE_KEY as Hex);
  const reader = arkivReader();
  if (await reader.getBalance({ address: account.address }) < parseEther("0.05")) {
    const tx = await workerWriter().sendTransaction({ to: account.address, value: parseEther("0.2") });
    check("test wallet funding", (await reader.waitForTransactionReceipt({ hash: tx })).status === "success", tx);
  }
  const owner = createWalletClient({ account, chain: rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" }), transport: http(arkivEndpoint(), { retryCount: 0, timeout: 30000 }) });
  const lastJob = process.argv.includes("--resume") ? (await readState<Job[]>("jobs", [])).findLast(job => job.owner === account.address.toLowerCase() && job.stage === "complete") : null;
  const existing = lastJob ? await getDataset(lastJob.datasetKey) : null;
  const head = await finalizedBlock(), start = existing ? BigInt(existing.startBlock) : head.number! - 4n, end = existing ? BigInt(existing.endBlock) : head.number!;
  const definition = existing ? { entityKey: existing.key as Hex, txHash: undefined } : await owner.createEntity(DatasetSchema, { name: "USDC verified local integration", chainId: u64(137), contract: addr(USDC), writer: addr(writerAddress()), startBlock: u64(start), endBlock: u64(end), enabled: true, continuous: false, sourceTime: u64(Math.floor(Date.now() / 1000)), document: stringToBytes(JSON.stringify({ version: 1, description: "Real Polygon events imported and verified by the AXIS local integration test." })) }, { expiration: ExpirationTime.fromDays(30) });
  const datasetKey = definition.entityKey;
  check("wallet-owned dataset definition", (await getDataset(datasetKey)).owner === account.address.toLowerCase(), datasetKey);
  let coverage;
  if (!existing) {
  const firstJob = await enqueue(datasetKey, account.address.toLowerCase(), start.toString(), (start + 2n).toString());
  await withLock("worker", () => runJob(firstJob), 1);
  coverage = await coverageSummary(await getDataset(datasetKey));
  check("bounded import readback", coverage.throughBlock === (start + 2n).toString() && coverage.gaps.length === 0, `${coverage.actualRows} records`);
  check("incomplete coverage explicitly reported", !coverage.complete);
  const retryJob = await enqueue(datasetKey, account.address.toLowerCase(), start.toString(), (start + 2n).toString());
  await withLock("worker", () => runJob(retryJob), 1);
  const afterRetry = await coverageSummary(await getDataset(datasetKey));
  check("repeated import is idempotent", afterRetry.actualRows === coverage.actualRows && retryJob.processed === 0 && retryJob.duplicates === coverage.actualRows);
  const incremental = await enqueue(datasetKey, account.address.toLowerCase(), (start + 3n).toString(), end.toString());
  await withLock("worker", () => runJob(incremental), 1);
  }
  coverage = await coverageSummary(await getDataset(datasetKey));
  check("incremental checkpoint is complete", coverage.complete && coverage.throughBlock === end.toString() && coverage.manifests.length === 2);
  const source = await extractRange(start.toString(), end.toString()), sourceAnalytics = aggregateTransfers(source.rows);
  const query = await executeQuery(datasetKey, {}, "analytics");
  check("exact aggregate equals Polygon source", "analytics" in query && query.analytics.amountRaw === sourceAnalytics.amountRaw && query.analytics.transfers === source.rows.length, `${source.rows.length} records; raw ${sourceAnalytics.amountRaw}`);
  const sample = source.rows[0];
  if (sample) {
    const filtered = await executeQuery(datasetKey, { sender: sample.sender }, "analytics");
    check("indexed sender filter", "analytics" in filtered && filtered.analytics.transfers === source.rows.filter(row => row.sender === sample.sender).length);
  }
  const page1 = await executeQuery(datasetKey, { order: "asc" }, "page", 0, 5), page2 = await executeQuery(datasetKey, { order: "asc" }, "page", 5, 5);
  check("pagination returns separate source records", "entities" in page1 && "entities" in page2 && !!page1.entities?.length && !!page2.entities?.length && page1.entities.every(row => !page2.entities?.some(other => other.sourceId === row.sourceId)));
  let rejected = false; try { await executeQuery(datasetKey, { predicate: "not a valid predicate" }, "analytics"); } catch { rejected = true; }
  check("invalid query rejected", rejected);
  const document: DashboardDocument = { version: 1, title: "Polygon USDC · verified local dashboard", description: "Exact analytics from a complete five-block Polygon source range.", refreshMs: 0, widgets: [
    { id: "count", title: "Indexed transfers", kind: "metric", metric: "transfers", grouping: "time", width: 1, query: { datasetKey, filters: {} } },
    { id: "amount", title: "Gross transferred USDC", kind: "metric", metric: "amount", grouping: "time", width: 1, query: { datasetKey, filters: {} } },
    { id: "senders", title: "USDC by sender", kind: "bar", metric: "amount", grouping: "sender", width: 2, query: { datasetKey, filters: {} } },
    { id: "rows", title: "Latest source transfers", kind: "table", metric: "transfers", grouping: "time", width: 2, query: { datasetKey, filters: {} } },
  ] };
  const priorDashboard = existing ? (await listDashboards()).find(item => item.document.widgets[0]?.query.datasetKey === datasetKey) : null;
  const dashboard = priorDashboard ? { entityKey: priorDashboard.key as Hex, txHash: undefined } : await owner.createEntity(DashboardSchema, { title: document.title, published: true, sourceTime: u64(Math.floor(Date.now() / 1000)), document: stringToBytes(JSON.stringify(document)) }, { expiration: ExpirationTime.fromDays(30) });
  check("dashboard definition round trip", JSON.stringify((await getDashboard(dashboard.entityKey)).document) === JSON.stringify(document), dashboard.entityKey);
  rejected = false; try { await workerWriter().patchEntity(DashboardSchema, dashboard.entityKey, { set: { title: "Unauthorized edit" } }); } catch { rejected = true; }
  check("non-owner cannot modify dashboard", rejected);
  const expiring = await owner.createEntity(DatasetSchema, { name: "AXIS expiration check", chainId: u64(137), contract: addr(USDC), writer: addr(writerAddress()), startBlock: u64(start), endBlock: u64(start), enabled: false, continuous: false, sourceTime: u64(Math.floor(Date.now() / 1000)), document: stringToBytes(JSON.stringify({ description: "Short-lived integration check" })) }, { expiration: ExpirationTime.fromSeconds(2) });
  for (let index = 0; index < 10; index++) { if ((await reader.getBlockTiming()).currentBlock >= expiring.expiresAt) break; await new Promise(resolve => setTimeout(resolve, 1000)); }
  rejected = false; try { await getEntity("axis.dataset.v1", expiring.entityKey); } catch { rejected = true; }
  check("expired definitions reported unavailable", rejected);
  const evidence = { datasetKey, dashboardKey: dashboard.entityKey, owner: account.address, writer: writerAddress(), fromBlock: start.toString(), toBlock: end.toString(), transfers: source.rows.length, amountRaw: sourceAnalytics.amountRaw, amount: sourceAnalytics.amount, datasetTransaction: definition.txHash, dashboardTransaction: dashboard.txHash, sourceTransaction: sample?.txHash, results, at: new Date().toISOString() };
  await writeState("live-evidence", evidence); console.log(JSON.stringify({ liveIntegration: "passed", ...evidence }));
} catch (error) { console.log(JSON.stringify({ liveIntegration: "failed", error: safeError(error), results })); process.exitCode = 1; }
