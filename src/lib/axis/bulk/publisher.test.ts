import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { encodeAbiParameters } from "viem";
import { config, fixtureSource } from "./fixtures.test-helper";
import { extractStage } from "./staging";
import { decodeStageProtocols } from "./protocol-stage";
import { DEPLOYMENTS } from "./protocols";
import { publicationBatches, publishStage, type PublicationBackend, type PublishRecord, type StoredImport } from "./publisher";
import type { RpcSource } from "./rpc";
import { bulkTableAvailable } from "./publication-model";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });
async function prepared() {
  const directory = await mkdtemp(join(tmpdir(), "axis-publication-test-")); directories.push(directory);
  const base = fixtureSource(), source: RpcSource = { ...base.source, read: async <T>(method: string, params: unknown[]): Promise<T> => {
    if (method === "eth_call" && (params[0] as { to: string }).to === DEPLOYMENTS.aaveV3.provider) return encodeAbiParameters([{ type: "address" }], [DEPLOYMENTS.aaveV3.pool]) as T;
    return base.source.read<T>(method, params);
  } };
  await extractStage(directory, config, source); await decodeStageProtocols(directory, source); return directory;
}
function memoryBackend() {
  let saved: StoredImport | null = null, nonce = 0, writes = 0, failAfterWrite = false, pending = false;
  const rows = new Map<number, PublishRecord>();
  const backend: PublicationBackend = {
    exclusive: action => action(), identity: async () => ({ chainId: 7794095, owner: "0x" + "34".repeat(20) }),
    balance: async () => 10n ** 19n, nonces: async () => ({ latest: nonce, pending: nonce + Number(pending) }),
    findImport: async () => saved && structuredClone(saved),
    createImport: async (_hash, document) => { saved = { key: "0x" + "12".repeat(32), status: "publishing", document: structuredClone(document) }; return structuredClone(saved); },
    patchImport: async (_key, status, document) => { saved = { ...saved!, status, document: structuredClone(document) }; nonce++; return { txHash: `patch-${nonce}`, gasCostWei: "1" }; },
    readRange: async (_key, from, to) => [...rows].filter(([ordinal]) => ordinal >= from && ordinal <= to).map(([ordinal, record]) => ({ ordinal, record: structuredClone(record) })),
    writeRecords: async (_key, batch, expectedNonce) => { expect(expectedNonce).toBe(nonce); writes++; nonce++; for (const row of batch) { if (rows.has(row.ordinal)) throw new Error("Duplicate write"); rows.set(row.ordinal, structuredClone(row.record)); } if (failAfterWrite) { failAfterWrite = false; throw new Error("Broadcast succeeded but receipt delivery failed"); } return { txHash: `write-${nonce}`, gasCostWei: "1" }; },
  };
  return { backend, rows, writes: () => writes, saved: () => saved, failNextReceipt: () => { failAfterWrite = true; }, setPending: () => { pending = true; } };
}
const options = { batchSize: 4, maxBatchBytes: 40_000, maxSpendWei: 1000n };
describe("Verified Arkiv publication", () => {
  it("publishes complete source blocks, then resumes without duplicating entities", async () => {
    const directory = await prepared(), fake = memoryBackend();
    const result = await publishStage(directory, fake.backend, options);
    expect(result.status).toBe("complete"); expect(result.records).toBe(16); expect(result.counts["token-transfers"]).toBe(4);
    expect(result.counts["stablecoin-transfers"]).toBe(2); expect(fake.saved()?.document.committedBlocks).toBe(2);
    const writes = fake.writes(); await publishStage(directory, fake.backend, options); expect(fake.writes()).toBe(writes);
  });
  it("recovers an uncertain successful write by reading chain identities before sending again", async () => {
    const directory = await prepared(), fake = memoryBackend(); fake.failNextReceipt();
    await expect(publishStage(directory, fake.backend, options)).rejects.toThrow("receipt delivery");
    expect(fake.saved()?.document.committedBlocks).toBe(0);
    await expect(publishStage(directory, fake.backend, options)).resolves.toMatchObject({ status: "complete", records: 16 });
    expect(fake.rows.size).toBe(16);
  });
  it("does not certify corrupt readback or write while a nonce is pending", async () => {
    const directory = await prepared(), fake = memoryBackend(); fake.setPending();
    await expect(publishStage(directory, fake.backend, options)).rejects.toThrow("pending"); expect(fake.rows.size).toBe(0);
    const other = memoryBackend(), read = other.backend.readRange;
    other.backend.readRange = async (...args) => (await read(...args)).map(row => ({ ...row, record: { ...row.record, timestamp: "0" } }));
    await expect(publishStage(directory, other.backend, options)).rejects.toThrow("readback"); expect(other.saved()?.document.throughBlock).toBeNull();
  });
  it("stops at its spend checkpoint and enforces transaction payload limits", async () => {
    const directory = await prepared(), fake = memoryBackend();
    await expect(publishStage(directory, fake.backend, { ...options, maxSpendWei: 1n })).rejects.toThrow("budget reached");
    expect(fake.saved()?.document.committedBlocks).toBe(0);
    expect(() => publicationBatches([], { ...options, batchSize: 1000 })).toThrow("limits");
  });
  it("publishes selected tables with block continuity and excludes omitted tables from catalog coverage", async () => {
    const directory = await prepared(), fake = memoryBackend();
    const result = await publishStage(directory, fake.backend, { ...options, tables: ["token-transfers"] });
    expect(result.records).toBe(6); expect(result.status).toBe("complete");
    const document = fake.saved()!.document;
    expect(document.selectedTables).toEqual(["polygon-blocks", "token-transfers"]);
    expect(bulkTableAvailable(document, "token-transfers")).toBe(true);
    expect(bulkTableAvailable(document, "stablecoin-transfers")).toBe(true);
    expect(bulkTableAvailable(document, "polygon-logs")).toBe(false);
    const writes = fake.writes(); await publishStage(directory, fake.backend, { ...options, tables: ["token-transfers"] }); expect(fake.writes()).toBe(writes);
    const unsupported = memoryBackend();
    await expect(publishStage(directory, unsupported.backend, { ...options, tables: ["token-lists"] })).rejects.toThrow("unavailable");
    expect(unsupported.saved()).toBeNull();
  });
});
