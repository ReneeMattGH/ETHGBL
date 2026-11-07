import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, type Hex } from "viem";
import { config, fixture, hash, sender, recipient, tokenA } from "./fixtures.test-helper";
import { record, type StageRecord } from "./model";
import { emptyProtocolEvidence } from "./protocols";
import { ENRICHMENT_EVENTS, ENRICHMENT_POLICY, decodeExtraProtocols, enrichmentCoverage, enrichmentRecord, marketRecords, ratingRecords, traceRecords, type EnrichmentIO } from "./enrichment";
import { BULK_TABLES, bulkTableAvailable, publicationPlan, type PublishedImportDocument } from "./publication-model";

function rawLog(index: number, address: string, args: Record<string, unknown>, types: string[], values: unknown[]): StageRecord {
  const event = ENRICHMENT_EVENTS[index], base = fixture(10).logs[0];
  return record({ tableId: "polygon-logs", sourceId: "137:log:fixture:0", blockNumber: "10", blockHash: hash(10), timestamp: "1700000010", contract: address, txHash: base.transactionHash, payload: { ...base, address, topics: encodeEventTopics({ abi: [event.abi], eventName: event.abi.name, args } as unknown as Parameters<typeof encodeEventTopics>[0]) as string[], data: encodeAbiParameters(types.map(type => ({ type })), values) } });
}
const io: EnrichmentIO = { rpc: async () => { throw new Error("Unexpected RPC"); }, json: async () => { throw new Error("Unexpected JSON"); } };
const v1 = Object.keys(ENRICHMENT_POLICY.exchanges)[0], v2 = Object.keys(ENRICHMENT_POLICY.exchanges)[1];
describe("Scoped enrichment adapters", () => {
  it("decodes each Polymarket fill version once, preserving base units and ignoring spoof emitters", async () => {
    const a = rawLog(0, v1, { orderHash: hash(55), maker: sender as Hex, taker: recipient as Hex }, ["uint256", "uint256", "uint256", "uint256", "uint256"], [0n, 77n, 123456789012345678901n, 200n, 1n]);
    const b = rawLog(1, v2, { orderHash: hash(56), maker: sender as Hex, taker: recipient as Hex }, ["uint8", "uint256", "uint256", "uint256", "uint256", "bytes32", "bytes32"], [1, 88n, 300n, 400n, 2n, hash(0), hash(1)]);
    const first = await decodeExtraProtocols([a], emptyProtocolEvidence(), io, new Set());
    expect(first).toHaveLength(1); expect(first[0].payload).toMatchObject({ family: "polymarket-v1", args: { makerAssetId: "0", takerAssetId: "77", makerAmountFilled: "123456789012345678901" } });
    const second = await decodeExtraProtocols([b], emptyProtocolEvidence(), io, new Set());
    expect(second[0].payload).toMatchObject({ family: "polymarket-v2", args: { side: 1, tokenId: "88", fee: "2" } });
    expect(await decodeExtraProtocols([{ ...a, payload: { ...a.payload as object, address: tokenA } }], emptyProtocolEvidence(), io, new Set())).toEqual([]);
    // A v2 ABI cannot be accepted for the allowlisted v1 contract.
    expect(await decodeExtraProtocols([{ ...b, payload: { ...b.payload as object, address: v1 } }], emptyProtocolEvidence(), io, new Set())).toEqual([]);
  });
  it("rejects Algebra event lookalikes unless the official factory maps the emitting pool", async () => {
    const raw = rawLog(3, tokenA, { sender: sender as Hex, recipient: recipient as Hex }, ["int256", "int256", "uint160", "uint128", "int24"], [-100n, 200n, 300n, 400n, -5]);
    const evidence = emptyProtocolEvidence();
    expect(await decodeExtraProtocols([raw], evidence, io, new Set())).toEqual([]);
    evidence.rejectedPools[tokenA] = { address: tokenA, family: "uniswap-v3", observedAtBlock: "10", call: { to: tokenA, data: "0x", blockNumber: "10" }, result: encodeAbiParameters([{ type: "address" }], [ENRICHMENT_POLICY.algebraFactory]), failure: null };
    let calls = 0;
    const rpc = async <T>() => { const values = [ENRICHMENT_POLICY.algebraFactory, sender, recipient, tokenA]; return encodeAbiParameters([{ type: "address" }], [values[calls++] as Hex]) as T; };
    const rows = await decodeExtraProtocols([raw], evidence, { ...io, rpc }, new Set());
    expect(rows.map(r => r.tableId)).toEqual(["quickswap-pools", "quickswap-swaps"]);
    expect(rows[1].payload).toMatchObject({ token0: sender, token1: recipient, args: { amount0: "-100", amount1: "200" } });
    calls = 0;
    await expect(decodeExtraProtocols([raw], evidence, { ...io, rpc: async <T>() => encodeAbiParameters([{ type: "address" }], [[ENRICHMENT_POLICY.algebraFactory, sender, recipient, sender][calls++] as Hex]) as T }, new Set())).rejects.toThrow("membership mismatch");
  });
  it("requires market API results to match the exact observed token and aligns outcomes", async () => {
    const raw = rawLog(0, v1, { orderHash: hash(55), maker: sender as Hex, taker: recipient as Hex }, ["uint256", "uint256", "uint256", "uint256", "uint256"], [0n, 77n, 1n, 2n, 0n]);
    const fills = await decodeExtraProtocols([raw], emptyProtocolEvidence(), io, new Set());
    const json = async () => ({ fetchedAt: "2026-11-07T00:00:00Z", sha256: "hash", value: [{ conditionId: hash(99), question: "Fixture", clobTokenIds: '["77","78"]', outcomes: '["Yes","No"]' }] });
    const rows = await marketRecords(raw, fills, { ...io, json });
    expect(rows.map(r => r.tableId)).toEqual(["polymarket-markets", "polymarket-outcome_tokens", "polymarket-outcome_tokens"]);
    expect(rows[2].payload).toMatchObject({ tokenId: "78", outcome: "No", tokenStandard: "ERC-1155" });
    const longId = `137:outcome:${hash(1)}:${(2n ** 255n).toString()}`;
    const compact = enrichmentRecord(raw, "polymarket-outcome_tokens", longId, { tokenId: (2n ** 255n).toString() });
    expect(Buffer.byteLength(compact.sourceId)).toBeLessThanOrEqual(128);
    expect(compact.payload).toMatchObject({ sourceIdentity: longId, tokenId: (2n ** 255n).toString() });
    await expect(marketRecords(raw, fills, { ...io, json: async () => ({ ...await json(), value: [{ conditionId: hash(99), clobTokenIds: '["999"]' }] }) })).rejects.toThrow("ignored");
  });
  it("computes a bounded reproducible activity score only from the declared transaction interval", () => {
    const first = record({ tableId: "polygon-blocks", sourceId: "block", blockNumber: config.fromBlock, blockHash: hash(10), timestamp: "1700000010", contract: null, txHash: null, payload: {} });
    const txs = [10, 11].map(n => ({ ...first, tableId: "polygon-transactions" as const, blockNumber: String(n), payload: { transaction: fixture(n).block.transactions[0] } }));
    const rows = ratingRecords(first, txs, "11");
    expect(rows).toHaveLength(2); expect(rows[1].payload).toMatchObject({ transactions: 2, activeBlocks: 2, score: 14, fromBlock: "10", toBlock: "11" });
  });
  it("retains trace paths, creation failures and inherited reverts without inventing ABI decodes", () => {
    const first = record({ tableId: "polygon-transactions", sourceId: "tx", blockNumber: "10", blockHash: hash(10), timestamp: "1", contract: null, txHash: hash(110), payload: {} });
    const rows = traceRecords(first, { type: "CALL", from: sender, to: recipient, input: "0x123456780000", error: "reverted", calls: [{ type: "CREATE2", to: tokenA, input: "0x600000000000", value: "0xffffffffffffffffffff" }] });
    expect(rows).toHaveLength(4); expect(rows.find(r => r.tableId === "polygon-creation-traces")?.payload).toMatchObject({ path: "0.0", reverted: true, value: "1208925819614629174706175" });
    expect(rows.find(r => r.tableId === "polygon-decoded-traces")?.payload).toMatchObject({ selector: "0x12345678", candidates: [] });
    expect(enrichmentCoverage(true, "Provider tier denies tracing")["polygon-traces"]?.state).toBe("unavailable");
  });
  it("keeps legacy imports limited to their original tables and honors explicit exclusions", () => {
    const legacy = {} as PublishedImportDocument;
    expect(Object.keys(BULK_TABLES)).toHaveLength(40);
    expect(bulkTableAvailable(legacy, "aave-withdrawals")).toBe(true);
    expect(bulkTableAvailable(legacy, "aave-reserves")).toBe(false);
    expect(bulkTableAvailable({ ...legacy, tableCoverage: { "polygon-traces": { state: "unavailable", detail: "Denied" } } }, "polygon-traces")).toBe(false);
    expect(publicationPlan({ version: 1, enriched: false, tables: ["token-transfers", "token-transfers"] })).toEqual({ version: 1, enriched: false, tables: ["token-transfers"] });
    expect(() => publicationPlan({ version: 1, enriched: false, tables: ["unindexed-table"] })).toThrow("Invalid");
    expect(() => publicationPlan({ version: 1, enriched: false, tables: ["polygon-blocks"], maxSpend: 999 })).toThrow("Invalid");
  });
});
