import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { stringToHex } from "viem";
import type { Entity } from "@arkiv-network/sdk";
import type { QueryResult } from "./model";

const mocks = vi.hoisted(() => ({ upload: vi.fn(), stamp: vi.fn(), execute: vi.fn(), combined: vi.fn(), entity: vi.fn(), query: vi.fn(), block: vi.fn(), txReceipt: vi.fn(), state: new Map<string, unknown>(), remote: new Map<string, string>() }));
vi.mock("@ethersphere/bee-js", async original => ({ ...await original<typeof import("@ethersphere/bee-js")>(), Bee: class { stamp = { get: mocks.stamp }; collection = { uploadFromFileList: mocks.upload }; } }));
vi.mock("@arkiv-network/sdk/query", () => ({ runQuery: mocks.query }));
vi.mock("./runtime", async original => ({ ...await original<typeof import("./runtime")>(), arkivReader: () => ({ getBlock: mocks.block, getTransactionReceipt: mocks.txReceipt }) }));
vi.mock("./store", async original => ({ ...await original<typeof import("./store")>(), executeQuery: mocks.execute, executeCombinedQuery: mocks.combined, getEntity: mocks.entity }));
vi.mock("./queue", () => ({ readState: vi.fn(async (name, fallback) => structuredClone(mocks.state.get(name) ?? fallback)), writeState: vi.fn(async (name, value) => { mocks.state.set(name, structuredClone(value)); }), withLock: vi.fn(async (_name, action) => action()) }));
import { buildSnapshotPackage, documentFromManifest, sha256, snapshotCsv } from "./swarm-package";
import { publicSwarmReference, snapshotIntent, snapshotMessage, validateSnapshotDocument, GATEWAY_POSTAGE_SELECTOR } from "./swarm-model";
import { swarmConfiguration, uploadQuerySnapshot, verifySwarmSnapshot, readArkivSnapshot, downloadSwarmFile, resumeSwarmUpload, swarmGatewayUrl, findArkivSnapshot, prepareSnapshotPublication, listArkivSnapshots } from "./swarm";
import { safeError } from "./runtime";

const owner = privateKeyToAccount(generatePrivateKey());
const key = `0x${"1".repeat(64)}`, hash = `0x${"2".repeat(64)}`, reference = "b".repeat(64), batchId = "c".repeat(64);
const intent = snapshotIntent({ title: "Treasury snapshot", description: "A frozen public result", query: { datasetKey: key, filters: {} } });
function result(): QueryResult {
  return {
    dataset: { key, name: "USDC transfers", description: "", chainId: 137, contract: owner.address, writer: owner.address, owner: owner.address, creator: owner.address, expiresAt: "999999999", startBlock: "10", endBlock: "20", enabled: true, continuous: false, createdAt: "2026-11-07T00:00:00Z" },
    coverage: { complete: true, throughBlock: "20", fromBlock: "10", requestedThrough: "20", expectedRows: 1, actualRows: 1, gaps: [], manifests: [] },
    scope: { fromBlock: "10", toBlock: "20", fromTime: null, toTime: null },
    entities: [{ sourceId: "137:tx:0", datasetKey: key, chainId: 137, contract: owner.address, blockNumber: "15", blockHash: hash, timestamp: "1804464000", txHash: hash, txIndex: 0, logIndex: 0, sender: owner.address, recipient: owner.address, amountRaw: "90071992547409931234567890", amount: "90071992547409931234.567890", decimals: 6, contentHash: hash }],
    fetchedAt: "2026-11-07T00:00:00Z", executedQuery: "verified query", blockNumber: "42",
  };
}
function pack() {
  return buildSnapshotPackage(intent, result(), { publisher: owner.address.toLowerCase(), postageBatchId: batchId, batchBuyerAddress: owner.address, batchDonor: null, uploadService: "Test Bee" }, "2026-11-07T00:00:00Z");
}
function serve(packed = pack()) {
  mocks.remote.set("manifest.json", packed.manifestText);
  for (const [path, text] of Object.entries(packed.contents)) mocks.remote.set(path, text);
  return documentFromManifest(packed.manifest, reference, packed.manifestSha256);
}
async function authorize(input = intent, timestamp = Date.now()) {
  const nonce = "a".repeat(48), origin = "http://localhost:3000";
  return { nonce, timestamp, signature: await owner.signMessage({ message: snapshotMessage(input, nonce, timestamp, origin) }) };
}
beforeEach(() => {
  vi.stubEnv("SWARM_UPLOAD_MODE", "bee");
  vi.stubEnv("SWARM_SNAPSHOT_PROFILE", "report");
  vi.clearAllMocks(); mocks.state.clear(); mocks.remote.clear();
  vi.stubEnv("SWARM_BEE_URL", "https://bee.example"); vi.stubEnv("SWARM_POSTAGE_BATCH_ID", batchId);
  vi.stubEnv("SWARM_ALLOWED_UPLOADERS", owner.address); vi.stubEnv("SWARM_READ_GATEWAY_URL", "https://read.example");
  vi.stubEnv("SWARM_API_TOKEN", "private-service-token"); vi.stubEnv("SWARM_BATCH_OWNER_ADDRESS", owner.address); vi.stubEnv("SWARM_BATCH_DONOR", ""); vi.stubEnv("SWARM_UPLOAD_SERVICE_NAME", "Test Bee"); vi.stubEnv("SWARM_MAX_UPLOADS_PER_DAY", "10");
  mocks.stamp.mockResolvedValue({ usable: true, duration: { toSeconds: () => 86400 }, remainingSize: { toBytes: () => 1e9 } });
  mocks.execute.mockImplementation(async () => result()); mocks.combined.mockImplementation(async () => result());
  mocks.upload.mockImplementation(async (_batch, files: File[]) => { for (const file of files) mocks.remote.set(file.name, await file.text()); return { reference: { toHex: () => reference } }; });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    expect(new URL(url).origin).toBe("https://read.example");
    expect(init.headers).toBeUndefined(); // Never send the Bee API token to a read gateway.
    const content = mocks.remote.get(new URL(url).pathname.split("/").at(-1)!);
    return new Response(content ?? "missing", { status: content === undefined ? 404 : 200 });
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Public snapshot packages", () => {
  it("keeps exact amounts, all rows, reproducible files and hashes", () => {
    const p = pack();
    expect(JSON.parse(p.contents["results.json"]).entities[0].amountRaw).toBe("90071992547409931234567890");
    expect(p.contents["results.csv"]).toContain("90071992547409931234567890");
    expect(p.manifest.files.every(file => sha256(p.contents[file.path]) === file.sha256)).toBe(true);
    expect(p.manifest.rowCount).toBe(1);
    expect(validateSnapshotDocument(documentFromManifest(p.manifest, reference, p.manifestSha256)).swarmReference).toBe(reference);
  });
  it("escapes report markup and CSV formulas without changing JSON records", () => {
    const r = result(); r.entities![0].sourceId = '=HYPERLINK("malicious")';
    const p = buildSnapshotPackage({ ...intent, title: "<script>alert(1)</script>" }, r, pack().manifest);
    expect(p.contents["index.html"]).not.toContain("<script>");
    expect(snapshotCsv(r.entities!)).toContain("\"'=HYPERLINK");
    expect(JSON.parse(p.contents["results.json"]).entities[0].sourceId).toBe(r.entities![0].sourceId);
  });
  it("rejects encrypted references, coverage gaps, duplicate rows and large payloads", () => {
    expect(() => publicSwarmReference("d".repeat(128))).toThrow(/Encrypted/);
    const r = result(); r.coverage.gaps.push("missing block");
    expect(() => buildSnapshotPackage(intent, r, pack().manifest)).toThrow(/verified/);
    r.coverage.gaps = []; r.entities!.push(r.entities![0]);
    expect(() => buildSnapshotPackage(intent, r, pack().manifest)).toThrow(/duplicate/);
    const large = result(); large.executedQuery = "x".repeat(21 * 1024 * 1024);
    expect(() => buildSnapshotPackage(intent, large, pack().manifest)).toThrow(/20 MiB/);
  });
});
describe("Swarm upload authorization and recovery", () => {
  it("uploads with gateway-provided postage without inventing batch provenance or calling private stamp APIs", async () => {
    vi.stubEnv("SWARM_SNAPSHOT_PROFILE", "data");
    vi.stubEnv("SWARM_UPLOAD_MODE", "public-gateway"); vi.stubEnv("SWARM_BEE_URL", ""); vi.stubEnv("SWARM_POSTAGE_BATCH_ID", ""); vi.stubEnv("SWARM_API_TOKEN", "");
    expect(swarmConfiguration()).toMatchObject({ configured: true, uploadMode: "public-gateway", missing: [] });
    const receipt = await uploadQuerySnapshot(intent, await authorize(), "http://localhost:3000");
    expect(mocks.stamp).not.toHaveBeenCalled();
    expect(mocks.upload).toHaveBeenCalledWith(GATEWAY_POSTAGE_SELECTOR, expect.any(Array), expect.objectContaining({ encrypt: false, deferred: false }));
    expect(receipt.document).toMatchObject({ postageSource: "gateway-provided", postageSelector: GATEWAY_POSTAGE_SELECTOR, postageBatchId: null, batchBuyerAddress: null, batchDonor: null, uploadService: "https://api.gateway.ethswarm.org" });
    expect(mocks.upload.mock.calls[0][1].map((file: File) => file.name).sort()).toEqual(["manifest.json", "results.csv", "results.json"]);
    expect(mocks.upload.mock.calls[0][2].indexDocument).toBe("manifest.json");
    expect((await verifySwarmSnapshot(receipt.document)).result.entities).toEqual(result().entities);
    expect(() => validateSnapshotDocument({ ...receipt.document, postageBatchId: GATEWAY_POSTAGE_SELECTOR })).toThrow(/separately/);
    expect(() => validateSnapshotDocument({ ...receipt.document, batchBuyerAddress: owner.address })).toThrow(/unknown/);
  });
  it("requires explicit gateway mode and refuses to forward private credentials to it", () => {
    vi.stubEnv("SWARM_POSTAGE_BATCH_ID", GATEWAY_POSTAGE_SELECTOR);
    expect(() => swarmConfiguration()).toThrow(/explicit public-gateway/);
    vi.stubEnv("SWARM_UPLOAD_MODE", "public-gateway"); vi.stubEnv("SWARM_BEE_URL", "");
    expect(() => swarmConfiguration()).toThrow(/private Bee credentials/);
  });
  it("retains the full report format for gateway uploads when report profile is selected", async () => {
    vi.stubEnv("SWARM_UPLOAD_MODE", "public-gateway"); vi.stubEnv("SWARM_BEE_URL", ""); vi.stubEnv("SWARM_POSTAGE_BATCH_ID", ""); vi.stubEnv("SWARM_API_TOKEN", "");
    const receipt = await uploadQuerySnapshot(intent, await authorize(), "http://localhost:3000");
    expect(mocks.upload.mock.calls[0][1].map((file: File) => file.name).sort()).toEqual(["index.html", "manifest.json", "results.csv", "results.json"]);
    expect(mocks.upload.mock.calls[0][2].indexDocument).toBe("index.html");
    expect(receipt.document.artifactProfile).toBeUndefined();
  });
  it("exports on the server, uploads directly, independently verifies and reuses the same request", async () => {
    const auth = await authorize();
    const receipt = await uploadQuerySnapshot(intent, auth, "http://localhost:3000");
    expect(receipt.document.rowCount).toBe(1);
    expect(mocks.execute).toHaveBeenCalledWith(key, { order: "desc" }, "export");
    expect(mocks.upload).toHaveBeenCalledWith(batchId, expect.any(Array), { indexDocument: "index.html", encrypt: false, deferred: false });
    expect(await uploadQuerySnapshot(intent, auth, "http://localhost:3000")).toEqual(receipt);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });
  it("does not reupload after gateway failure and supports local resume", async () => {
    const auth = await authorize(); const fetchMock = vi.mocked(fetch);
    fetchMock.mockRejectedValueOnce(new Error("gateway temporarily unavailable"));
    await expect(uploadQuerySnapshot(intent, auth, "http://localhost:3000")).rejects.toThrow(/temporarily/);
    const entries = mocks.state.get("swarm-uploads") as { id: string; state: string }[];
    expect(entries[0].state).toBe("uploaded");
    const recovered = await resumeSwarmUpload(entries[0].id);
    expect(recovered.document.swarmReference).toBe(reference);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });
  it("rejects altered, expired and unauthorized requests before exporting or uploading", async () => {
    const auth = await authorize();
    await expect(uploadQuerySnapshot({ ...intent, title: "Changed" }, auth, "http://localhost:3000")).rejects.toThrow(/not authorized/);
    await expect(uploadQuerySnapshot(intent, await authorize(intent, Date.now() - 700000), "http://localhost:3000")).rejects.toThrow(/expired/);
    vi.stubEnv("SWARM_ALLOWED_UPLOADERS", `0x${"e".repeat(40)}`);
    await expect(uploadQuerySnapshot(intent, auth, "http://localhost:3000")).rejects.toThrow(/not authorized/);
    expect(mocks.execute).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("rejects unusable stamps and enforces a persisted daily cap", async () => {
    mocks.stamp.mockResolvedValueOnce({ usable: false });
    await expect(uploadQuerySnapshot(intent, await authorize(), "http://localhost:3000")).rejects.toThrow(/not usable/);
    vi.stubEnv("SWARM_MAX_UPLOADS_PER_DAY", "1");
    mocks.state.set("swarm-uploads", [{ id: "existing", state: "started", createdAt: new Date().toISOString() }]);
    await expect(uploadQuerySnapshot(intent, await authorize(), "http://localhost:3000")).rejects.toThrow(/daily/);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("reports missing credentials honestly and redacts service tokens", () => {
    vi.stubEnv("SWARM_BEE_URL", ""); vi.stubEnv("SWARM_POSTAGE_BATCH_ID", "");
    expect(swarmConfiguration()).toMatchObject({ configured: false, missing: ["SWARM_BEE_URL", "SWARM_POSTAGE_BATCH_ID"] });
    expect(safeError(new Error("failed private-service-token"))).toBe("failed [redacted]");
  });
});
describe("Arkiv-linked snapshot reads", () => {
  it("maps a known Swarm reference to a CID read host without appending /bzz", () => {
    vi.stubEnv("SWARM_READ_GATEWAY_URL", "https://{cid}.bzz.limo");
    expect(swarmGatewayUrl("7523bbbd9b117c13bafc97ad025171e7b01a65f592b057f207eba86edaaa6b48", "index.html")).toBe("https://bah5acgzaour3xpm3cf6bhox4s6wqeulr46ybuzpvskyfp4qh5oug5wvknnea.bzz.limo/index.html");
    vi.stubEnv("SWARM_READ_GATEWAY_URL", "https://example.com/{cid}");
    expect(() => swarmGatewayUrl(reference)).toThrow(/CID read gateway/);
  });
  it("reconciles existing Arkiv publications using indexed fields, then compares document hashes and reads creation proof", async () => {
    const d = serve();
    const attrs = { title: d.title, swarmReference: d.swarmReference, manifestSha256: d.manifestSha256, chainId: "137", rows: "1", fromBlock: "10", throughBlock: "20", sourceTime: String(Math.floor(Date.parse(d.createdAt) / 1000)) };
    const entity = { key, owner: owner.address, creator: owner.address, createdAt: 42n, expiresAt: 999999999n, attributes: { ...Object.fromEntries(Object.entries(attrs).map(([name, value]) => [name, { type: "str", value }])), document: { type: "bytes", value: stringToHex(JSON.stringify(d)) } } } as unknown as Entity;
    mocks.query.mockResolvedValue({ entities: [entity], count: 1n }); mocks.entity.mockResolvedValue(entity);
    mocks.block.mockResolvedValue({ transactions: [{ from: owner.address, input: stringToHex(d.swarmReference), hash }] }); mocks.txReceipt.mockResolvedValue({ status: "success" });
    expect(await findArkivSnapshot(d)).toMatchObject({ entityKey: key, txHash: hash, expiresAt: "999999999" });
    expect(await prepareSnapshotPublication(d)).toMatchObject({ verified: true, publication: { entityKey: key, txHash: hash } });
    const query = mocks.query.mock.calls[0][1];
    expect(query.query).toContain("swarmReference = str(");
    expect(query.query).not.toMatch(/manifestSha256|\$createdAt/);
    expect(query.select.createdAt).toBe(true);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("verifies an unpublished receipt and refuses bad remote files before publication", async () => {
    const d = serve(); mocks.query.mockResolvedValue({ entities: [], count: 0n });
    expect(await prepareSnapshotPublication(d)).toMatchObject({ verified: true, publication: null });
    mocks.remote.set("results.csv", "broken");
    await expect(prepareSnapshotPublication(d)).rejects.toThrow(/checksum|size/);
  });
  it("lists real Arkiv metadata with owner pagination and excludes malformed entities without downloading files", async () => {
    const d = serve();
    const attrs = { title: d.title, swarmReference: d.swarmReference, manifestSha256: d.manifestSha256, chainId: "137", rows: "1", fromBlock: "10", throughBlock: "20", sourceTime: String(Math.floor(Date.parse(d.createdAt) / 1000)) };
    const entity = { key, owner: owner.address, creator: owner.address, expiresAt: 999999999n, attributes: { ...Object.fromEntries(Object.entries(attrs).map(([name, value]) => [name, { type: "str", value }])), document: { type: "bytes", value: stringToHex(JSON.stringify(d)) } } } as unknown as Entity;
    mocks.query.mockResolvedValue({ entities: [entity, { ...entity, owner: `0x${"e".repeat(40)}` }], count: 28n });
    const list = await listArkivSnapshots(owner.address, 25);
    expect(list).toMatchObject({ total: "28", offset: 25, limit: 25, invalidEntries: 1 });
    expect(list.snapshots).toHaveLength(1);
    expect(mocks.query.mock.calls[0][1]).toMatchObject({ offset: 25, limit: 25 });
    expect(mocks.query.mock.calls[0][1].query).toContain("$owner = addr(");
    expect(fetch).not.toHaveBeenCalled();
    await expect(listArkivSnapshots("bad-owner")).rejects.toThrow(/owner/);
    await expect(listArkivSnapshots(undefined, -1)).rejects.toThrow(/pagination/);
  });
  it("verifies all files, exact rows, and document values independent of JSON property order", async () => {
    const d = serve();
    const reordered = Object.fromEntries(Object.entries(d).reverse());
    expect((await verifySwarmSnapshot(reordered as typeof d)).result.entities).toEqual(result().entities);
  });
  it("rejects checksum mismatches and row-count claims", async () => {
    const d = serve(); mocks.remote.set("results.csv", "tampered");
    await expect(verifySwarmSnapshot(d)).rejects.toThrow(/checksum|size/);
    serve(); await expect(verifySwarmSnapshot({ ...d, rowCount: 2 })).rejects.toThrow(/does not match/);
    serve(); mocks.remote.set("manifest.json", "{}");
    await expect(verifySwarmSnapshot(d)).rejects.toThrow(/checksum/);
  });
  it("follows an Arkiv entity and rejects owner/reference mismatches", async () => {
    const d = serve();
    const attrs = { title: d.title, swarmReference: d.swarmReference, manifestSha256: d.manifestSha256, chainId: "137", rows: "1", fromBlock: "10", throughBlock: "20", sourceTime: String(Math.floor(Date.parse(d.createdAt) / 1000)) };
    const entity = { key, owner: owner.address, creator: owner.address, expiresAt: 999999999n, attributes: { ...Object.fromEntries(Object.entries(attrs).map(([name, value]) => [name, { type: "str", value }])), document: { type: "bytes", value: stringToHex(JSON.stringify(d)) } } } as unknown as Entity;
    mocks.entity.mockResolvedValue(entity);
    expect((await readArkivSnapshot(key)).document.rowCount).toBe(1);
    mocks.entity.mockResolvedValue({ ...entity, owner: `0x${"e".repeat(40)}` });
    await expect(readArkivSnapshot(key)).rejects.toThrow(/do not agree/);
  });
  it("bounds streamed downloads and refuses unknown paths", async () => {
    mocks.remote.set("results.json", "123456789");
    await expect(downloadSwarmFile(reference, "results.json", 3)).rejects.toThrow(/size/);
    await expect(downloadSwarmFile(reference, "../wallet", 100)).rejects.toThrow(/Unknown/);
  });
  it("does not treat a gateway hash-approval redirect as a verified report", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://bzz.link/forbidden?hash=" + reference } }));
    await expect(downloadSwarmFile(reference, "index.html", 2000)).rejects.toThrow(/content approval/);
  });
});
