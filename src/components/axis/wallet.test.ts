import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addr, u64 } from "@arkiv-network/sdk/schema";
import { DatasetSchema, DashboardSchema } from "@/lib/axis/schemas";
import { SnapshotSchema } from "@/lib/axis/swarm-schema";
import type { SnapshotDocument } from "@/lib/axis/swarm-model";
import { hexToString, bytesToHex } from "viem";
import { USDC, type Dataset } from "@/lib/axis/model";

const { createEntity } = vi.hoisted(() => ({ createEntity: vi.fn() }));
vi.mock("@arkiv-network/sdk", async importOriginal => ({
  ...await importOriginal<typeof import("@arkiv-network/sdk")>(),
  createWalletClient: vi.fn(() => ({ createEntity })),
}));
import { createDataset, saveResultDataset, publishDashboard, publishSnapshot } from "./wallet";
import { dashboardStarter } from "@/lib/axis/dashboard-document";

const owner = `0x${"11".repeat(20)}` as const;
const writer = `0x${"22".repeat(20)}` as const;
const fetchConfig = vi.fn();
it("publishes shared dashboard filters, analytical layouts and explanations in the Arkiv document", async () => {
  const query = { datasetKey: `0x${"33".repeat(32)}`, filters: { sender: owner } };
  const document = { version: 1 as const, title: "Treasury report", description: "Verified USDC activity", query, refreshMs: 30000, widgets: dashboardStarter(query) };
  await publishDashboard(owner, document);
  expect(createEntity).toHaveBeenCalledWith(DashboardSchema, expect.objectContaining({ title: "Treasury report", published: true }), expect.anything());
  const saved = JSON.parse(hexToString(bytesToHex(createEntity.mock.calls[0][1].document)));
  expect(saved).toEqual(document);
});
beforeEach(() => {
  vi.stubGlobal("fetch", fetchConfig);
  vi.stubGlobal("window", { ethereum: { request: vi.fn(async ({ method }) => method === "eth_accounts" ? [owner] : null) } });
  createEntity.mockResolvedValue({ entityKey: "test", txHash: "test" });
});

describe("Saving executed results as datasets", () => {
  const sourceKey = `0x${"33".repeat(32)}`;
  const dataset = { key: sourceKey, writer, chainId: 137, contract: USDC, startBlock: "10", endBlock: "20" } as Dataset;
  const data = { name: " Treasury activity ", description: "Verified result", dataset, filters: { sender: owner }, fromBlock: "10", throughBlock: "20", rows: 125 };
  it("publishes a real dataset with the full result scope and source filters", async () => {
    await saveResultDataset(owner, data);
    expect(createEntity).toHaveBeenCalledWith(DatasetSchema, expect.objectContaining({ name: "Treasury activity", startBlock: u64(10), endBlock: u64(20), continuous: false, enabled: true, writer: addr(writer) }), expect.anything());
    const values = createEntity.mock.calls[0][1];
    expect(JSON.parse(hexToString(bytesToHex(values.document)))).toMatchObject({ description: "Verified result", resultSource: { datasetKey: sourceKey, rows: 125, filters: [{ sender: owner, order: "desc" }] } });
    expect(fetchConfig).not.toHaveBeenCalled();
  });
  it("preserves earlier constraints when saving from another result dataset", async () => {
    await saveResultDataset(owner, { ...data, dataset: { ...dataset, key: `0x${"44".repeat(32)}`, resultSource: { datasetKey: sourceKey, filters: [{ recipient: writer }], rows: 500 } } });
    const document = JSON.parse(hexToString(bytesToHex(createEntity.mock.calls[0][1].document)));
    expect(document.resultSource.filters).toEqual([{ recipient: writer, order: "desc" }, { sender: owner, order: "desc" }]);
    expect(document.resultSource.datasetKey).toBe(sourceKey);
  });
  it("rejects invalid names and scopes before requesting a wallet transaction", async () => {
    for (const invalid of [{ name: " " }, { fromBlock: "21" }, { rows: -1 }, { throughBlock: "invalid" }]) await expect(saveResultDataset(owner, { ...data, ...invalid })).rejects.toThrow();
    expect(createEntity).not.toHaveBeenCalled();
  });
  it("saves all combined scopes and their own filters rather than only the first dataset", async () => {
    const otherKey = `0x${"55".repeat(32)}`;
    await saveResultDataset(owner, { ...data, throughBlock: "40", rows: 300, sources: [
      { dataset, filters: { sender: owner }, fromBlock: "10", throughBlock: "20" },
      { dataset: { ...dataset, key: otherKey, startBlock: "30" }, filters: { recipient: writer }, fromBlock: "30", throughBlock: "40" },
    ] });
    const document = JSON.parse(hexToString(bytesToHex(createEntity.mock.calls[0][1].document)));
    expect(document.resultSource).toMatchObject({ rows: 300, scopes: [
      { datasetKey: sourceKey, fromBlock: "10", throughBlock: "20", filters: [{ sender: owner, order: "desc" }] },
      { datasetKey: otherKey, fromBlock: "30", throughBlock: "40", filters: [{ recipient: writer, order: "desc" }] },
    ] });
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Continuous dataset publishing", () => {
  it("uses fresh finalized source data and the configured writer without user block boundaries", async () => {
    fetchConfig.mockResolvedValue({ ok: true, json: async () => ({ writer, finalizedBlock: "96863522" }) });
    await createDataset(owner, { name: "My USDC data", description: "Transfers" });
    expect(fetchConfig).toHaveBeenCalledWith("/api/axis/config", { cache: "no-store" });
    expect(createEntity).toHaveBeenCalledWith(DatasetSchema, expect.objectContaining({
      name: "My USDC data", writer: addr(writer), startBlock: u64("96863522"), endBlock: u64(0), continuous: true, enabled: true,
    }), expect.anything());
  });
  it("does not publish when a finalized starting point is unavailable", async () => {
    fetchConfig.mockResolvedValue({ ok: true, json: async () => ({ writer, finalizedBlock: null }) });
    await expect(createDataset(owner, { name: "My USDC data", description: "" })).rejects.toThrow("Polygon source is unavailable");
    expect(createEntity).not.toHaveBeenCalled();
  });
});

describe("Public Swarm snapshot publishing", () => {
  const document: SnapshotDocument = { version: 1, title: "Treasury snapshot", description: "Frozen records", publisher: owner, createdAt: "2026-11-07T00:00:00Z", swarmReference: "a".repeat(64), manifestSha256: "b".repeat(64), rowCount: 125, chainId: 137, fromBlock: "10", throughBlock: "20", sourceDatasetKeys: [`0x${"33".repeat(32)}`], postageBatchId: "c".repeat(64), batchBuyerAddress: owner, batchDonor: null, uploadService: "Operator Bee" };
  it("publishes the real Swarm reference and manifest checksum in Arkiv fields", async () => {
    fetchConfig.mockResolvedValueOnce({ ok: true, json: async () => ({ verified: true, publication: null }) });
    await publishSnapshot(owner, document);
    expect(createEntity).toHaveBeenCalledWith(SnapshotSchema, expect.objectContaining({ swarmReference: document.swarmReference, manifestSha256: document.manifestSha256, chainId: u64(137), rows: u64(125), fromBlock: u64(10), throughBlock: u64(20) }), expect.anything());
    expect(JSON.parse(hexToString(bytesToHex(createEntity.mock.calls[0][1].document)))).toEqual(document);
  });
  it("rejects encrypted references and a different publishing wallet before sending a transaction", async () => {
    await expect(publishSnapshot(owner, { ...document, swarmReference: "a".repeat(128) })).rejects.toThrow(/Encrypted/);
    await expect(publishSnapshot(writer, document)).rejects.toThrow(/wallet that authorized/);
    expect(createEntity).not.toHaveBeenCalled();
  });
  it("reuses an already verified Arkiv publication without requesting another transaction", async () => {
    fetchConfig.mockResolvedValueOnce({ ok: true, json: async () => ({ verified: true, publication: { entityKey: "existing", txHash: null } }) });
    expect(await publishSnapshot(owner, document)).toEqual({ entityKey: "existing", txHash: null });
    expect(createEntity).not.toHaveBeenCalled();
    expect(window.ethereum!.request).not.toHaveBeenCalled();
  });
  it("stops before wallet publication when remote file verification fails", async () => {
    fetchConfig.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Swarm file checksum mismatch" }) });
    await expect(publishSnapshot(owner, document)).rejects.toThrow(/checksum/);
    expect(createEntity).not.toHaveBeenCalled();
    expect(window.ethereum!.request).not.toHaveBeenCalled();
  });
});
