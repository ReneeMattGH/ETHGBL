import nextEnv from "@next/env";
import { readFileSync, appendFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { addr, u64 } from "@arkiv-network/sdk/schema";
import { http, stringToBytes, type Hex } from "viem";
nextEnv.loadEnvConfig(process.cwd());
const { arkivEndpoint, safeError, writerAddress } = await import("../src/lib/axis/runtime");
const { DatasetSchema, DashboardSchema } = await import("../src/lib/axis/schemas");
const { getDataset, getDashboard, listDashboards, coverageSummary, executeQuery } = await import("../src/lib/axis/store");
const { finalizedBlock, extractRange } = await import("../src/lib/axis/polygon");
const { advancedUsdcDashboard } = await import("../src/lib/axis/presets");
const { validateDashboard } = await import("../src/lib/axis/core");
const { readState, writeState, heartbeat } = await import("../src/lib/axis/queue");
import type { Job } from "../src/lib/axis/model";
const log = (event: string, data: object = {}) => console.log(JSON.stringify({ event, ...data }));
try {
  const account = privateKeyToAccount(parseEnv(readFileSync(".env.browser-test.local", "utf8")).AXIS_TEST_PRIVATE_KEY as Hex);
  const publisher = process.env.AXIS_PREBUILT_PUBLISHER;
  if (publisher && publisher.toLowerCase() !== account.address.toLowerCase()) throw new Error("Configured preset publisher differs from the available local publishing account.");
  if (!publisher) appendFileSync(".env.local", `\n# Public publisher identity used to discover the prebuilt dashboard\nAXIS_PREBUILT_PUBLISHER=${account.address}\n`);
  const existing = (await listDashboards()).find(item => item.document.preset === "usdc-activity-v1" && item.owner === account.address.toLowerCase());
  if (existing) { log("prebuilt.already-published", { dashboardKey: existing.key, url: "http://localhost:3100/dashboards/prebuilt" }); process.exit(0); }
  if (!(await heartbeat()).running) throw new Error("Start npm.cmd run worker in a separate terminal before seeding the live preset.");
  const wallet = createWalletClient({ account, chain: rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" }), transport: http(arkivEndpoint(), { timeout: 30000, retryCount: 0 }) });
  let state = await readState<{ datasetKey: Hex; initialEnd: string; definitionTransaction: string } | null>("prebuilt-bootstrap", null);
  if (!state) {
    const head = await finalizedBlock();
    const definition = await wallet.createEntity(DatasetSchema, { name: "Polygon USDC · Live activity", chainId: u64(137), contract: addr("0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"), writer: addr(writerAddress()), startBlock: u64(head.number! - 1n), endBlock: u64(head.number!), enabled: true, continuous: true, sourceTime: u64(Math.floor(Date.now() / 1000)), document: stringToBytes(JSON.stringify({ version: 1, description: "Continuously imported Polygon native USDC Transfer events for the advanced rolling analytics dashboard.", ingestionChunkBlocks: 2, abiVersion: "ERC20.Transfer.v1" })) }, { expiration: ExpirationTime.fromDays(30) });
    state = { datasetKey: definition.entityKey, initialEnd: head.number!.toString(), definitionTransaction: definition.txHash };
    await writeState("prebuilt-bootstrap", state);
    log("dataset.published", state);
  }
  let complete = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    const summary = await coverageSummary(await getDataset(state.datasetKey));
    if (summary.gaps.length) throw new Error(summary.gaps.join(" "));
    if (summary.complete) { complete = true; break; }
    if (attempt % 3 === 0) {
      const job = (await readState<Job[]>("jobs", [])).findLast(job => job.datasetKey === state!.datasetKey);
      log("dataset.importing", { stage: job?.stage ?? "awaiting worker", processed: job?.processed ?? 0, total: job?.total ?? 0 });
      if (job?.stage === "failed") throw new Error(job.error ?? "Import failed.");
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  if (!complete) throw new Error("The initial import did not complete within ten minutes. Bootstrap state is saved for a retry.");
  const dataset = await getDataset(state.datasetKey);
  const source = await extractRange(dataset.startBlock, state.initialEnd);
  const analytics = await executeQuery(state.datasetKey, { lookbackBlocks: "60" }, "analytics");
  const totalRaw = source.rows.reduce((sum, row) => sum + BigInt(row.amountRaw), 0n).toString();
  if (!("analytics" in analytics) || analytics.analytics.amountRaw !== totalRaw || analytics.analytics.transfers !== source.rows.length) throw new Error("Initial source-to-dashboard analytics verification failed.");
  const document = advancedUsdcDashboard(state.datasetKey); validateDashboard(document);
  const published = await wallet.createEntity(DashboardSchema, { title: document.title, published: true, sourceTime: u64(Math.floor(Date.now() / 1000)), document: stringToBytes(JSON.stringify(document)) }, { expiration: ExpirationTime.fromDays(30) });
  const readback = await getDashboard(published.entityKey);
  if (JSON.stringify(readback.document) !== JSON.stringify(document)) throw new Error("Dashboard readback differs from the published definition.");
  await wallet.patchEntity(DatasetSchema, state.datasetKey, { set: { endBlock: u64(0), continuous: true } });
  const evidence = { dashboardKey: published.entityKey, datasetKey: state.datasetKey, publisher: account.address, initialFromBlock: dataset.startBlock, initialThroughBlock: state.initialEnd, initialTransfers: source.rows.length, initialAmountRaw: totalRaw, dashboardTransaction: published.txHash, definitionTransaction: state.definitionTransaction, widgets: document.widgets.length, refreshMs: document.refreshMs, publishedAt: new Date().toISOString() };
  await writeState("prebuilt-evidence", evidence); log("prebuilt.published-and-verified", evidence);
} catch (error) { log("prebuilt.failed", { error: safeError(error) }); process.exitCode = 1; }
