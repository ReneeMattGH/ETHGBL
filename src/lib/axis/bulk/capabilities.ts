import { arkivEndpoint, safeError, writerAddress } from "../runtime";
import { baseQuery, pageEntities } from "../store";
import { USDC } from "../model";
import { blockNumber, quantity, rpcQuantity, type RpcBlock } from "./model";
import { rpcSource } from "./rpc";

export type Capability = { status: "supported" | "failed" | "not-checked"; durationMs: number; detail: string };
export async function capabilityReport(options: { historicalBlock?: string; traces?: boolean } = {}) {
  const checks: Record<string, Capability> = {};
  async function probe(name: string, action: () => Promise<string>) {
    const start = performance.now();
    try { checks[name] = { status: "supported", durationMs: Math.round(performance.now() - start), detail: await action() }; checks[name].durationMs = Math.round(performance.now() - start); }
    catch (error) { checks[name] = { status: "failed", durationMs: Math.round(performance.now() - start), detail: safeError(error) }; }
  }
  const polygon = rpcSource(process.env.POLYGON_RPC_URL, { attempts: 1, timeoutMs: 15_000, maxBytes: 4 * 1024 * 1024 });
  let final: string | null = null, historical: RpcBlock | null = null;
  await probe("polygon.chain", async () => { const chain = quantity(await polygon.read<string>("eth_chainId", [])); if (chain !== "137") throw new Error(`Expected chain 137, received ${chain}.`); return "Polygon PoS mainnet (137)"; });
  if (checks["polygon.chain"].status === "supported") {
    await probe("polygon.finalized", async () => { const block = await polygon.read<RpcBlock>("eth_getBlockByNumber", ["finalized", false]); if (!block?.hash) throw new Error("No finalized header."); final = quantity(block.number); return `Finalized block ${final}`; });
    if (final) {
      const selected = options.historicalBlock ? blockNumber(options.historicalBlock) : (BigInt(final) > 1000n ? BigInt(final) - 1000n : 0n).toString();
      if (BigInt(selected) > BigInt(final)) throw new Error("Capability sample exceeds finalized boundary.");
      const tag = rpcQuantity(selected);
      await probe("polygon.historicalBlock", async () => { historical = await polygon.read<RpcBlock>("eth_getBlockByNumber", [tag, true]); if (!historical?.hash || quantity(historical.number) !== selected || !Array.isArray(historical.transactions)) throw new Error("Historical block response is incomplete."); return `Block ${selected}; ${historical.transactions.length} transactions. This sample does not establish full archive coverage.`; });
      await probe("polygon.logs", async () => { const logs = await polygon.read<unknown[]>("eth_getLogs", [{ address: USDC, fromBlock: tag, toBlock: tag }]); if (!Array.isArray(logs)) throw new Error("Invalid logs response."); return `${logs.length} USDC logs in one sampled block; maximum range not established.`; });
      await probe("polygon.blockReceipts", async () => { const receipts = await polygon.read<unknown[]>("eth_getBlockReceipts", [tag]); if (!Array.isArray(receipts) || historical && receipts.length !== historical.transactions.length) throw new Error("Receipt count does not match the sampled block."); return `${receipts.length} block receipts`; });
      await probe("polygon.historicalCode", async () => { const code = await polygon.read<string>("eth_getCode", [USDC, tag]); if (!/^0x(?:[0-9a-f]{2})+$/i.test(code)) throw new Error("No bytecode at historical sample."); return `USDC bytecode readable at block ${selected}`; });
      await probe("polygon.historicalCall", async () => { const decimals = await polygon.read<string>("eth_call", [{ to: USDC, data: "0x313ce567" }, tag]); if (BigInt(decimals) !== 6n) throw new Error("Unexpected USDC decimals."); return `USDC historical state call succeeded at block ${selected}`; });
      const tx = (historical as RpcBlock | null)?.transactions[0];
      if (tx) {
        await probe("polygon.transactionReceipt", async () => { const receipt = await polygon.read<{ transactionHash: string }>("eth_getTransactionReceipt", [tx.hash]); if (receipt?.transactionHash?.toLowerCase() !== tx.hash.toLowerCase()) throw new Error("Receipt identity mismatch."); return "Per-transaction receipt fallback available"; });
        if (options.traces) await probe("polygon.trace", async () => { const trace = await polygon.read<{ type?: string }>("debug_traceTransaction", [tx.hash, { tracer: "callTracer", timeout: "5s" }]); if (!trace || typeof trace.type !== "string") throw new Error("No callTracer result."); return `One transaction traced at block ${selected}; historical trace availability and bulk limits remain unmeasured.`; });
      }
    }
  }
  checks["polygon.trace"] ??= { status: "not-checked", durationMs: 0, detail: "Run capabilities --traces to probe one transaction with callTracer." };
  let arkivHost: string | null = null;
  await probe("arkiv.chain", async () => { const endpoint = arkivEndpoint(); const arkiv = rpcSource(endpoint, { attempts: 1, timeoutMs: 15_000 }); arkivHost = arkiv.host; return `Destination chain ${quantity(await arkiv.read<string>("eth_chainId", []))}`; });
  await probe("arkiv.query", async () => { const result = await pageEntities(baseQuery("axis.block.v1", writerAddress()), 1); return `Trusted-writer query returned count ${result.count?.toString() ?? "unknown"} at Arkiv block ${result.blockNumber}`; });
  return { version: 1, checkedAt: new Date().toISOString(), polygonHost: polygon.host, arkivHost, finalizedBlock: final, checks, publication: { transactions: "not-benchmarked", prefill: "not-established", detail: "Read-only RPC checks cannot establish operator-assisted prefill access. No seed import or transaction was submitted." } };
}
