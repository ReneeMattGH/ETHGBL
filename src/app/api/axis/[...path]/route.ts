import { connection, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { recoverMessageAddress, type Hex } from "viem";
import { arkivEndpoint, safeError, writerAddress } from "@/lib/axis/runtime";
import { coverageSummary, executeQuery, getDataset, getDashboard, listDatasets, listDashboards, publishedJobs, savedQueries, assertKey, pageEntities, transferBase } from "@/lib/axis/store";
import { finalizedBlock } from "@/lib/axis/polygon";
import { enqueue, heartbeat, readState } from "@/lib/axis/queue";
import { jobMessage } from "@/lib/axis/auth";
import type { Job } from "@/lib/axis/model";

const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
type Context = { params: Promise<{ path: string[] }> };
let finalizedCache: { number: string; at: number } | null = null;
async function finalNumber() { if (!finalizedCache || Date.now() - finalizedCache.at > 15000) finalizedCache = { number: (await finalizedBlock()).number!.toString(), at: Date.now() }; return finalizedCache.number; }
export async function GET(request: Request, context: Context) {
  await connection();
  try {
    const { path } = await context.params, url = new URL(request.url);
    if (path[0] === "config") {
      let block: string | null = null, error: string | null = null;
      try { block = await finalNumber(); } catch (caught) { error = safeError(caught); }
      return json({ writer: writerAddress(), polygonConfigured: Boolean(process.env.POLYGON_RPC_URL), arkivConfigured: Boolean(process.env.ARKIV_ACCESS_KEY), worker: await heartbeat(), finalizedBlock: block, error });
    }
    if (path[0] === "datasets") {
      if (path[1]) { const dataset = await getDataset(path[1]); return json({ dataset, coverage: await coverageSummary(dataset) }); }
      return json({ datasets: await listDatasets() });
    }
    if (path[0] === "schema" && path[1]) {
      const dataset = await getDataset(path[1]);
      const sample = await pageEntities(transferBase(dataset.key), 1);
      return json({ observed: sample.entities.length > 0, fields: Object.entries(sample.entities[0]?.attributeSchema ?? {}).map(([name, field]) => ({ name, type: field.type, indexed: field.indexed ?? false })) });
    }
    if (path[0] === "dashboards") return path[1] ? json({ dashboard: await getDashboard(path[1]) }) : json({ dashboards: await listDashboards() });
    if (path[0] === "prebuilt") {
      const publisher = process.env.AXIS_PREBUILT_PUBLISHER?.toLowerCase();
      return json({ dashboard: publisher ? (await listDashboards()).find(item => item.owner === publisher && item.document.preset === "usdc-activity-v1") ?? null : null });
    }
    if (path[0] === "queries") return json({ queries: await savedQueries(url.searchParams.get("owner") ?? "") });
    if (path[0] === "ingestion") {
      const local = await readState<Job[]>("jobs", []), remote = await publishedJobs();
      const jobs = new Map(remote.map(job => [job.id, job]));
      for (const job of local) jobs.set(job.id, job);
      return json({ jobs: [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), worker: await heartbeat() });
    }
    if (path[0] === "challenge") return json({ nonce: randomBytes(24).toString("hex"), timestamp: Date.now() });
    return json({ error: "Unknown AXIS endpoint." }, 404);
  } catch (error) { return json({ error: safeError(error) }, 400); }
}
export async function POST(request: Request, context: Context) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin mutations are not accepted." }, 403);
    const text = await request.text();
    if (text.length > 200000) return json({ error: "Request too large." }, 413);
    const body = JSON.parse(text), { path } = await context.params;
    if (path[0] === "query") {
      if (!Number.isInteger(body.offset ?? 0) || (body.offset ?? 0) < 0 || (body.offset ?? 0) > 1000000 || !Number.isInteger(body.limit ?? 25) || (body.limit ?? 25) < 1 || (body.limit ?? 25) > 100) throw new Error("Invalid pagination.");
      return json(await executeQuery(body.datasetKey, body.filters ?? {}, body.mode === "export" ? "export" : body.mode === "analytics" ? "analytics" : "page", body.offset ?? 0, body.limit ?? 25));
    }
    if (path[0] === "ingestion") {
      assertKey(body.datasetKey);
      if (typeof body.timestamp !== "number" || Math.abs(Date.now() - body.timestamp) > 300000 || typeof body.nonce !== "string" || !/^[a-f0-9]{48}$/.test(body.nonce) || typeof body.signature !== "string") throw new Error("Invalid or expired ingestion authorization.");
      const owner = await recoverMessageAddress({ message: jobMessage(body.datasetKey, body.nonce, body.timestamp), signature: body.signature as Hex });
      const dataset = await getDataset(body.datasetKey);
      if (dataset.owner !== owner.toLowerCase()) return json({ error: "Only the dataset owner can request ingestion." }, 403);
      if (!dataset.enabled) throw new Error("Enable the dataset before requesting ingestion.");
      const summary = await coverageSummary(dataset);
      if (summary.gaps.length) throw new Error(summary.gaps.join(" "));
      const from = summary.throughBlock ? BigInt(summary.throughBlock) + 1n : BigInt(dataset.startBlock);
      const final = BigInt(await finalNumber()), ceiling = dataset.endBlock === "0" ? final : BigInt(dataset.endBlock);
      const to = from + 99n < ceiling ? from + 99n : ceiling;
      if (to > final) throw new Error("Dataset end is beyond the finalized block.");
      if (from > to) return json({ complete: true, message: "The requested dataset range is already verified." });
      return json({ job: await enqueue(dataset.key, dataset.owner, from.toString(), to.toString(), body.nonce) }, 202);
    }
    if (path[0] === "rpc") {
      const allowed = new Set(["eth_chainId", "eth_blockNumber", "eth_getBalance", "eth_getBlockByNumber", "eth_getTransactionCount", "eth_getTransactionReceipt", "eth_getTransactionByHash", "eth_call", "eth_estimateGas", "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_feeHistory"]);
      if (!allowed.has(body.method) || !Array.isArray(body.params)) return json({ error: { code: -32601, message: "Method not allowed on the read-only wallet RPC." } }, 403);
      const response = await fetch(arkivEndpoint(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: body.id ?? 1, method: body.method, params: body.params }), signal: AbortSignal.timeout(20000), cache: "no-store" });
      const payload = await response.json();
      if (payload.error) payload.error = { code: payload.error.code, message: safeError(payload.error.message) };
      return json(payload, response.ok ? 200 : 502);
    }
    return json({ error: "Unknown AXIS endpoint." }, 404);
  } catch (error) { return json({ error: safeError(error) }, 400); }
}
