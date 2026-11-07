import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonical, digest, record, validateBulkConfig } from "./model";
import { atomicJson, extractStage, readManifest, readPart, runDirectory, runLock, verifyStage } from "./staging";
import { blockExtractor, decodeTransfers, validateBlock } from "./source";
import { config, fixture, fixtureSource, hash, maxUint256, tokenA, tokenB } from "./fixtures.test-helper";

const directories: string[] = [];
async function directory() { const path = await mkdtemp(join(tmpdir(), "axis-bulk-test-")); directories.push(path); return path; }
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

describe("Bulk source consistency and scope", () => {
  it("rejects wrong chains, malformed boundaries, duplicate tokens and unsafe concurrency", () => {
    for (const bad of [{ chainId: 1 }, { fromBlock: "01" }, { toBlock: "9" }, { toBlock: "1000010" }, { concurrency: 0 }, { concurrency: 9 }, { tokens: [config.tokens[0], config.tokens[0]] }, { tokens: [{ address: tokenA, stablecoin: true, expectedDecimals: 256 }] }]) expect(() => validateBulkConfig({ ...config, ...bad })).toThrow();
    expect(() => runDirectory("../escape")).toThrow();
    expect(() => canonical({ amount: Number.MAX_SAFE_INTEGER + 1 })).toThrow("Unsafe");
  });
  it("detects missing/duplicate receipts, removed logs, wrong parent and invalid transaction order", () => {
    const { block, receipt } = fixture(10);
    expect(() => validateBlock(block, [], "10")).toThrow("Receipt count");
    expect(() => validateBlock({ ...block, transactions: [block.transactions[0], block.transactions[0]] }, [receipt, receipt], "10")).toThrow("Duplicate receipts");
    expect(() => validateBlock(block, [{ ...receipt, logs: [{ ...receipt.logs[0], removed: true }] }], "10")).toThrow("source log");
    expect(() => validateBlock(block, [{ ...receipt, logs: [receipt.logs[0], receipt.logs[0]] }], "10")).toThrow("source log");
    expect(() => validateBlock(block, [receipt], "10", hash(8))).toThrow("continuity");
    expect(() => validateBlock({ ...block, transactions: [{ ...block.transactions[0], transactionIndex: "0x1" }] }, [receipt], "10")).toThrow("identity");
  });
  it("falls back only when block-receipt RPC is unavailable and bounds fallback reads", async () => {
    const { source, calls } = fixtureSource({ receiptsUnsupported: true }), extract = blockExtractor(source, 2);
    await extract("10", [], false); await extract("11", [], false, hash(10));
    expect(calls.filter(call => call.method === "eth_getBlockReceipts")).toHaveLength(1);
    expect(calls.filter(call => call.method === "eth_getTransactionReceipt")).toHaveLength(2);
  });
});

describe("Durable staging and recovery", () => {
  it("resumes after an interrupted block without duplicating committed records or refetching committed receipts", async () => {
    const dir = await directory();
    await expect(extractStage(dir, config, fixtureSource({ failBlock: 11 }).source)).rejects.toThrow("interruption");
    const partial = await readManifest(dir); expect(partial.status).toBe("extracting"); expect(partial.parts).toHaveLength(1);
    await expect(verifyStage(dir)).rejects.toThrow("incomplete");
    const { source, calls } = fixtureSource();
    const verified = await extractStage(dir, config, source);
    expect(verified.counts["token-transfers"]).toBe(4); expect(verified.stablecoinTransfers).toBe(2);
    expect(calls.filter(call => call.method === "eth_getBlockReceipts")).toEqual([{ method: "eth_getBlockReceipts", params: ["0xb"] }]);
    const resumed = await extractStage(dir, config, source); expect(resumed.counts).toEqual(verified.counts);
  });
  it("preserves separate token identities, decimals and the full uint256 value", async () => {
    const dir = await directory(), result = await extractStage(dir, config, fixtureSource().source);
    const transfers = (await readPart(dir, result.manifest.parts[0])).filter(row => row.tableId === "token-transfers");
    expect(transfers.map(row => row.contract)).toEqual([tokenA, tokenB]);
    expect(transfers[0].payload).toMatchObject({ amountRaw: maxUint256, decimals: 6, stablecoin: true });
    expect(transfers[1].payload).toMatchObject({ amount: "1.000000000000000001", decimals: 18, stablecoin: false });
    const { block, logs } = fixture(10);
    expect(() => decodeTransfers([{ ...logs[0], topics: [...logs[0].topics, hash(1)] }], result.manifest.tokens, block)).toThrow("incompatible");
  });
  it("rejects corrupted files before resuming and detects falsified derived amounts even with updated checksums", async () => {
    const dir = await directory(), verified = await extractStage(dir, config, fixtureSource().source);
    const part = verified.manifest.parts[0], path = join(dir, "parts", part.file), original = await readFile(path, "utf8");
    await writeFile(path, original + " "); await expect(verifyStage(dir)).rejects.toThrow("size");
    await writeFile(path, original);
    const rows = await readPart(dir, part), index = rows.findIndex(row => row.tableId === "token-transfers");
    const { version, contentHash, ...body } = rows[index];
    expect(version).toBe(1); expect(contentHash).toMatch(/^[0-9a-f]{64}$/);
    rows[index] = record({ ...body, payload: { ...(body.payload as object), amountRaw: "1" } });
    const changed = rows.map(canonical).join("\n") + "\n";
    await writeFile(path, changed); part.sha256 = digest(changed); part.bytes = Buffer.byteLength(changed);
    await atomicJson(join(dir, "manifest.json"), verified.manifest);
    await expect(verifyStage(dir)).rejects.toThrow("decoded records");
  });
  it("refuses changed selections, wrong token decimals, concurrent runs and changed checkpoints", async () => {
    const dir = await directory(); await extractStage(dir, config, fixtureSource().source);
    await expect(extractStage(dir, { ...config, toBlock: "12" }, fixtureSource().source)).rejects.toThrow("configuration changed");
    await expect(extractStage(dir, config, fixtureSource({ changedCheckpoint: true }).source)).rejects.toThrow("checkpoint");
    await expect(runLock(dir, () => extractStage(dir, config, fixtureSource().source))).rejects.toThrow("locked");
    const other = await directory();
    await expect(extractStage(other, { ...config, tokens: [{ ...config.tokens[0], expectedDecimals: 18 }] }, fixtureSource().source)).rejects.toThrow("decimals mismatch");
  });
  it("rejects manifests marked complete with missing blocks", async () => {
    const dir = await directory(); await expect(extractStage(dir, config, fixtureSource({ failBlock: 11 }).source)).rejects.toThrow();
    const manifest = await readManifest(dir); manifest.status = "complete"; await atomicJson(join(dir, "manifest.json"), manifest);
    await expect(verifyStage(dir)).rejects.toThrow("declared range");
  });
});
