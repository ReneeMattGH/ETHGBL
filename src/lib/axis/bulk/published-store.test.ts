import { beforeEach, describe, expect, it, vi } from "vitest";
import { Entity } from "@arkiv-network/sdk";
import { str, u64, key, bytes, addr } from "@arkiv-network/sdk/schema";
import { stringToBytes, type Hex } from "viem";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@arkiv-network/sdk/query", () => ({ runQuery: query }));
vi.mock("../runtime", () => ({ writerAddress: () => "0x" + "34".repeat(20), arkivReader: () => ({}), retryRead: (action: () => Promise<unknown>) => action() }));
import { bulkCatalogPreview, bulkTableQuery } from "./published-store";
import { storedRecord } from "./arkiv-publication";
import type { PublishedImport } from "./publication-model";
const entityKey = ("0x" + "12".repeat(32)) as Hex, owner = ("0x" + "34".repeat(20)) as Hex;
const doc = { version: 1 as const, runId: "test", sourceFingerprint: "ab".repeat(32), configHash: "cd".repeat(32), decoderHash: "ef".repeat(32), tokens: [], counts: { "token-transfers": 2, "stablecoin-transfers": 1, "quickswap-swaps": 1 }, sourceHost: "fixture.invalid", committedBlocks: 1, throughBlock: "10", fromBlock: "10", toBlock: "11", recordCount: 4, retainedDays: 30, sourceScope: "test scope" };
const imported: PublishedImport = { key: entityKey, owner, name: "Verified test import", status: "publishing", expiresAt: "1000", document: doc };
beforeEach(() => { query.mockReset(); });
describe("Published import read boundaries", () => {
  it("binds every table to trusted owner, import key and committed record/block boundary", () => {
    const predicate = bulkTableQuery("dex-trades", imported);
    expect(predicate).toContain(`$owner = addr(${owner})`); expect(predicate).toContain(`importKey = key(${entityKey})`);
    expect(predicate).toContain("ordinal < u64(4)"); expect(predicate).toContain("blockNumber <= u64(10)");
    expect(predicate).toContain("tableId = str('quickswap-swaps') OR tableId = str('uniswap_v3-swaps')");
    expect(bulkTableQuery("stablecoin-transfers", imported)).toContain("stablecoin = true");
    expect(() => bulkTableQuery("polygon-blocks", { ...imported, document: { ...doc, throughBlock: null } })).toThrow("No verified");
  });
  it("rejects expired/missing rows and arbitrary unindexed catalog/schema requests", async () => {
    const entity = new Entity({ key: entityKey, owner, expiresAt: 1000n, attributes: { name: str("Verified import"), chainId: u64(137), status: str("publishing"), document: bytes(stringToBytes(JSON.stringify(doc))) } });
    query.mockImplementation(async (_client, request: { query: string }) => ({ entities: request.query.includes("axis.bulk.import.v1") ? [entity] : [], count: 0n, blockNumber: 100n }));
    await expect(bulkCatalogPreview("token-transfers", entityKey)).rejects.toThrow("coverage count differs");
    await expect(bulkCatalogPreview("__proto__", entityKey)).rejects.toThrow("not indexed");
    await expect(bulkCatalogPreview("polygon-traces", entityKey)).rejects.toThrow(/not indexed|not included/);
    await expect(bulkCatalogPreview("token-transfers", entityKey, -1)).rejects.toThrow("offset");
  });
  it("normalizes checksummed SDK address attributes without changing raw JSON payloads", () => {
    const mixed = "0xE7aC45525Bd9fec84902371Aaa65cF53c7D89909";
    const entity = new Entity({ key: entityKey, attributes: { tableId: str("token-transfers"), sourceId: str("137:test:0"), blockNumber: u64(10), blockHash: key(entityKey), sourceTime: u64(100), ordinal: u64(1), contract: addr(mixed), txHash: key(entityKey), contentHash: key(entityKey), document: bytes(stringToBytes(JSON.stringify({ amountRaw: "1", sender: mixed }))) } });
    const stored = storedRecord(entity);
    expect(stored.record.contract).toBe(mixed.toLowerCase()); expect(stored.record.payload).toEqual({ amountRaw: "1", sender: mixed });
  });
});
