import nextEnv from "@next/env";
import { parseArgs } from "node:util";
import { readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { parseEther } from "viem";
import { safeError } from "../src/lib/axis/runtime";
import { USDC } from "../src/lib/axis/model";
import { capabilityReport } from "../src/lib/axis/bulk/capabilities";
import { quantity, validateBulkConfig, type RpcBlock } from "../src/lib/axis/bulk/model";
import { rpcSource } from "../src/lib/axis/bulk/rpc";
import { atomicJson, bulkRoot, extractStage, readManifest, runDirectory, stageSummary, verifyStage } from "../src/lib/axis/bulk/staging";

nextEnv.loadEnvConfig(process.cwd(), undefined, { info: () => {}, error: () => {} });
// Source/export commands never load a signer. Only the explicit publish branch loads the worker file.
const log = (value: object) => console.log(JSON.stringify({ at: new Date().toISOString(), ...value }));
const bulkSource = () => rpcSource(process.env.POLYGON_RPC_URL, { minIntervalMs: Number(process.env.AXIS_BULK_RPC_INTERVAL_MS ?? "750"), attempts: 5 });
const command = process.argv[2];
const { values } = parseArgs({ args: process.argv.slice(3), options: {
  run: { type: "string" }, from: { type: "string" }, to: { type: "string" }, blocks: { type: "string" },
  config: { type: "string" }, tokens: { type: "string" }, concurrency: { type: "string" },
  block: { type: "string" }, traces: { type: "boolean" }, help: { type: "boolean" },
  "max-spend": { type: "string" }, "batch-size": { type: "string" },
  enriched: { type: "boolean" }, tables: { type: "string" },
} });
try {
  if (values.help || !command) {
    console.log("AXIS bulk ingestion (source staging, enrichment and verified Arkiv publication)\n" +
      "  npm.cmd run bulk -- capabilities [--block NUMBER] [--traces]\n" +
      "  npm.cmd run bulk -- extract --run ID [--blocks 5 | --from N --to M] [--tokens FILE] [--concurrency 2]\n" +
      "  npm.cmd run bulk -- extract --run ID --config FILE\n" +
      "  npm.cmd run bulk -- verify --run ID\n" +
      "  npm.cmd run bulk -- parquet --run ID\n" +
      "  npm.cmd run bulk -- decode --run ID\n" +
      "  npm.cmd run bulk -- verify-protocols --run ID\n" +
      "  npm.cmd run bulk -- protocol-parquet --run ID\n" +
      "  npm.cmd run bulk -- source-check --run ID\n" +
      "  npm.cmd run bulk -- enrich --run ID [--traces]\n" +
      "  npm.cmd run bulk -- verify-enrichment --run ID\n" +
      "  npm.cmd run bulk -- enrichment-parquet --run ID\n" +
      "  npm.cmd run bulk -- publish --run ID [--enriched] [--tables table-id,table-id] [--max-spend 1] [--batch-size 24]\n" +
      "Resume: repeat extract --run ID without range flags. Extraction never publishes to Arkiv.");
  } else if (command === "capabilities") {
    await mkdir(bulkRoot(), { recursive: true });
    const report = await capabilityReport({ historicalBlock: values.block, traces: values.traces });
    await atomicJson(join(bulkRoot(), "capabilities.json"), report); log({ event: "capabilities.checked", ...report });
    if (["polygon.chain", "polygon.finalized", "polygon.historicalBlock", "polygon.transactionReceipt", "arkiv.chain", "arkiv.query"].some(name => report.checks[name]?.status !== "supported")) process.exitCode = 1;
  } else if (["extract", "verify", "parquet", "decode", "verify-protocols", "protocol-parquet", "source-check", "publish", "enrich", "verify-enrichment", "enrichment-parquet"].includes(command)) {
    if (!values.run) throw new Error("Specify --run ID.");
    const directory = runDirectory(values.run);
    if (command === "publish") {
      if (!existsSync(".env.worker.local")) throw new Error("Publication requires the ignored .env.worker.local signer file.");
      process.loadEnvFile(".env.worker.local");
      const spend = values["max-spend"] ?? "1";
      if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$/.test(spend)) throw new Error("--max-spend must be a positive tGLM amount.");
      const { publishStage } = await import("../src/lib/axis/bulk/publisher");
      const { arkivPublicationBackend } = await import("../src/lib/axis/bulk/arkiv-publication");
      log({ event: "publication.started", runId: values.run });
      const { BULK_TABLES, publicationPlan } = await import("../src/lib/axis/bulk/publication-model");
      let plan;
      try { plan = publicationPlan(JSON.parse(await readFile(join(directory, "publication-plan.json"), "utf8"))); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      const tables = values.tables?.split(",") ?? plan?.tables;
      if (tables?.some(t => !Object.hasOwn(BULK_TABLES, t))) throw new Error("--tables contains an unknown catalog table ID.");
      log({ event: "publication.selection", tables: tables ?? "all implemented physical tables", enriched: values.enriched ?? plan?.enriched ?? false });
      log({ event: "publication.finished", ...await publishStage(directory, arkivPublicationBackend(), { maxSpendWei: parseEther(spend), batchSize: Number(values["batch-size"] ?? "24"), maxBatchBytes: 100_000, enriched: values.enriched ?? plan?.enriched, tables: tables as (keyof typeof BULK_TABLES)[] | undefined }, log) });
    } else if (command === "enrichment-parquet") {
      const { exportEnrichmentParquet } = await import("../src/lib/axis/bulk/parquet");
      log({ event: "enrichmentParquet.verified", ...await exportEnrichmentParquet(directory) });
    } else if (command === "enrich" || command === "verify-enrichment") {
      const { enrichStage, verifyEnrichment } = await import("../src/lib/axis/bulk/enrichment-stage");
      const result = command === "enrich" ? await enrichStage(directory, bulkSource(), values.traces, log) : await verifyEnrichment(directory);
      log({ event: "enrichment.verified", fingerprint: result.fingerprint, counts: result.counts, tableCoverage: result.tableCoverage, publication: "local-only" });
    } else if (command === "source-check") {
      const { crossCheckSource } = await import("../src/lib/axis/bulk/source-check");
      log({ event: "source.crossChecked", ...await crossCheckSource(directory, bulkSource()) });
    } else if (command === "decode") {
      const { decodeStageProtocols } = await import("../src/lib/axis/bulk/protocol-stage");
      log({ event: "protocols.verified", ...await decodeStageProtocols(directory, bulkSource(), log) });
    } else if (command === "verify-protocols") {
      const { verifyProtocolStage } = await import("../src/lib/axis/bulk/protocol-stage");
      const result = await verifyProtocolStage(directory); log({ event: "protocols.verified", status: result.manifest.status, counts: result.counts, views: result.views, publication: "local-only" });
    } else if (command === "verify") log({ event: "stage.verified", ...stageSummary(await verifyStage(directory)) });
    else if (command === "parquet") { const { exportParquet } = await import("../src/lib/axis/bulk/parquet"); log({ event: "parquet.verified", ...await exportParquet(directory) }); }
    else if (command === "protocol-parquet") { const { exportProtocolParquet } = await import("../src/lib/axis/bulk/parquet"); log({ event: "protocolParquet.verified", ...await exportProtocolParquet(directory) }); }
    else {
      const source = bulkSource();
      let config;
      if (values.config) {
        if (values.from || values.to || values.blocks || values.tokens || values.concurrency) throw new Error("Use --config alone, or use range/token flags.");
        config = validateBulkConfig(JSON.parse(await readFile(values.config, "utf8")));
      } else if (!values.from && !values.to && !values.blocks && !values.tokens && !values.concurrency) {
        // Reusing a run never silently changes its finalized boundary.
        try { config = (await readManifest(directory)).config; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
      if (!config) {
        if (Boolean(values.from) !== Boolean(values.to) || values.blocks && values.from) throw new Error("Supply --from and --to together, or --blocks.");
        let from = values.from, to = values.to;
        if (!from || !to) {
          if (values.blocks !== undefined && !/^[1-9][0-9]{0,3}$/.test(values.blocks)) throw new Error("--blocks must be 1–1000.");
          const blocks = Number(values.blocks ?? "5"); if (blocks > 1000) throw new Error("--blocks must be 1–1000.");
          const final = await source.read<RpcBlock>("eth_getBlockByNumber", ["finalized", false]);
          to = quantity(final.number); const start = BigInt(to) - BigInt(blocks) + 1n; from = (start < 0n ? 0n : start).toString();
        }
        const tokens = values.tokens ? JSON.parse(await readFile(values.tokens, "utf8")) : [{ address: USDC, stablecoin: true, expectedDecimals: 6 }];
        config = validateBulkConfig({ version: 1, chainId: 137, fromBlock: from, toBlock: to, tokens, concurrency: Number(values.concurrency ?? "2") });
      }
      const start = performance.now();
      const verified = await extractStage(directory, config, source, log);
      const result = { ...stageSummary(verified), elapsedMs: Math.round(performance.now() - start), rpcCalls: source.calls(), publication: "local-only" };
      await atomicJson(join(directory, "extraction-report.json"), result); log({ event: "extraction.complete", ...result });
    }
  } else throw new Error(`Unknown bulk command: ${command}. Use --help.`);
} catch (error) { log({ event: "bulk.failed", error: safeError(error) }); process.exitCode = 1; }
