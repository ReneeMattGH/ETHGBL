import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { blockNumber, canonical, digest, documentHash, rpcQuantity, validateBulkConfig, type BulkConfig, type RpcBlock, type RpcReceipt, type StageManifest, type StagePart, type StageRecord, type StagedTable } from "./model";
import { assertSource, blockExtractor, blockRecords, readTokenMetadata, validateBlock } from "./source";
import type { RpcSource } from "./rpc";

export const bulkRoot = () => join(process.cwd(), ".axis", "bulk");
export function runDirectory(id: string, root = bulkRoot()) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id)) throw new Error("Run ID must contain 1–80 letters, digits, underscores or hyphens.");
  return join(resolve(root), id);
}
export async function atomicJson(path: string, value: unknown) { await atomicFile(path, JSON.stringify(value, null, 2) + "\n"); }
export const atomicText = atomicFile;
async function atomicFile(path: string, contents: string) {
  const temporary = `${path}.${randomUUID()}.partial`;
  try {
    const handle = await open(temporary, "wx");
    try { await handle.writeFile(contents); await handle.sync(); } finally { await handle.close(); }
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, path); break; }
      catch (error) { if (attempt >= 6 || !["EPERM", "EACCES", "EBUSY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error; await new Promise(resolve => setTimeout(resolve, 20 * 2 ** attempt)); }
    }
  } finally { await rm(temporary, { force: true }); }
}
export async function runLock<T>(directory: string, action: () => Promise<T>): Promise<T> {
  await mkdir(directory, { recursive: true });
  const path = join(directory, "extract.lock");
  let handle;
  try { handle = await open(path, "wx"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("This run is locked. Check the recorded PID before removing an abandoned extract.lock file.");
    throw error;
  }
  try { await handle.writeFile(JSON.stringify({ pid: process.pid, at: new Date().toISOString() })); return await action(); }
  finally { await handle.close(); await rm(path, { force: true }); }
}
export async function readManifest(directory: string): Promise<StageManifest> {
  const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")) as StageManifest;
  const config = validateBulkConfig(manifest.config);
  if (manifest.version !== 1 || manifest.configHash !== documentHash(config) || !["extracting", "complete"].includes(manifest.status) || !Array.isArray(manifest.parts) || !Array.isArray(manifest.tokens)) throw new Error("Invalid stage manifest.");
  if (manifest.tokens.length !== config.tokens.length || manifest.tokens.some((token, index) => {
    const selection = config.tokens[index];
    return token.address !== selection.address || token.stablecoin !== selection.stablecoin || !Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 255 || (selection.expectedDecimals !== undefined && token.decimals !== selection.expectedDecimals) || token.observedAtBlock !== config.fromBlock || !/^0x[0-9a-f]{64}$/i.test(token.codeHash) || typeof token.symbol !== "string" || typeof token.name !== "string";
  })) throw new Error("Token metadata does not match the declared selection.");
  return manifest;
}
function countRecords(rows: StageRecord[]) {
  const counts: Partial<Record<StagedTable, number>> = {};
  for (const row of rows) counts[row.tableId] = (counts[row.tableId] ?? 0) + 1;
  return counts;
}
export async function readPart(directory: string, part: StagePart): Promise<StageRecord[]> {
  if (!/^[0-9]+-[0-9a-f]{64}\.ndjson$/.test(part.file)) throw new Error("Invalid stage part path.");
  const path = join(directory, "parts", part.file), info = await stat(path);
  if (!info.isFile() || info.size > 64 * 1024 * 1024 || info.size !== part.bytes) throw new Error("Stage part exceeds its byte budget or has changed size.");
  const bytes = await readFile(path);
  if (digest(bytes) !== part.sha256) throw new Error("Stage part checksum mismatch.");
  const rows = bytes.toString("utf8").trimEnd().split("\n").map(line => JSON.parse(line) as StageRecord);
  if (rows.length !== part.records || canonical(countRecords(rows)) !== canonical(part.counts)) throw new Error("Stage part row counts differ from manifest.");
  for (const row of rows) {
    const { contentHash, ...body } = row;
    if (contentHash !== documentHash(body) || row.blockNumber !== part.blockNumber || row.blockHash !== part.blockHash) throw new Error("Stage record hash or block identity mismatch.");
  }
  return rows;
}
function reconstruct(rows: StageRecord[]) {
  const headers = rows.filter(row => row.tableId === "polygon-blocks");
  if (headers.length !== 1) throw new Error("Each committed part must contain exactly one block header.");
  const header = headers[0].payload as unknown as RpcBlock;
  const transactions = rows.filter(row => row.tableId === "polygon-transactions").map(row => row.payload as unknown as { transaction: RpcBlock["transactions"][number]; receipt: RpcReceipt; logCount: number });
  const logs = rows.filter(row => row.tableId === "polygon-logs").map(row => row.payload as unknown as RpcReceipt["logs"][number]);
  const byTransaction = new Map<string, RpcReceipt["logs"]>();
  for (const log of logs) { const id = log.transactionHash.toLowerCase(); const list = byTransaction.get(id) ?? []; list.push(log); byTransaction.set(id, list); }
  if (canonical(header.transactions) !== canonical(transactions.map(item => item.transaction.hash.toLowerCase()))) throw new Error("Staged transaction list differs from block header.");
  const receipts = transactions.map(item => {
    const selected = byTransaction.get(item.transaction.hash.toLowerCase()) ?? [];
    if (selected.length !== item.logCount || item.receipt.logs.length !== 0) throw new Error("Staged log count differs from transaction receipt.");
    return { ...item.receipt, logs: selected };
  });
  if (receipts.reduce((sum, receipt) => sum + receipt.logs.length, 0) !== logs.length) throw new Error("Staged logs contain orphan transaction identities.");
  return { block: { ...header, transactions: transactions.map(item => item.transaction) }, receipts };
}
export async function verifyStage(directory: string, requireComplete = true) {
  const manifest = await readManifest(directory);
  if (requireComplete && manifest.status !== "complete") throw new Error("Extraction is incomplete; no complete export can be produced.");
  let next = BigInt(manifest.config.fromBlock), previous: string | undefined, stablecoinTransfers = 0;
  const counts: Partial<Record<StagedTable, number>> = {};
  for (const part of manifest.parts) {
    if (blockNumber(part.blockNumber) !== next.toString() || !/^0x[0-9a-f]{64}$/i.test(part.blockHash) || part.file !== `${part.blockNumber}-${part.blockHash.slice(2)}.ndjson` || next > BigInt(manifest.config.toBlock)) throw new Error("Stage parts are not a contiguous declared range.");
    const rows = await readPart(directory, part), { block, receipts } = reconstruct(rows);
    validateBlock(block, receipts, next.toString(), previous);
    if (block.parentHash.toLowerCase() !== part.parentHash || block.hash.toLowerCase() !== part.blockHash) throw new Error("Part manifest differs from its source header.");
    const expected = blockRecords(block, receipts, manifest.tokens, next === BigInt(manifest.config.fromBlock));
    if (canonical(expected) !== canonical(rows)) throw new Error("Staged decoded records do not match the raw source records.");
    for (const [table, count] of Object.entries(part.counts)) counts[table as StagedTable] = (counts[table as StagedTable] ?? 0) + count;
    stablecoinTransfers += rows.filter(row => row.tableId === "token-transfers" && (row.payload as { stablecoin?: boolean }).stablecoin === true).length;
    previous = part.blockHash; next++;
  }
  if (manifest.status === "complete" && next !== BigInt(manifest.config.toBlock) + 1n) throw new Error("Complete manifest does not cover its declared range.");
  return { status: manifest.status, fromBlock: manifest.config.fromBlock, throughBlock: manifest.parts.at(-1)?.blockNumber ?? null, blocks: manifest.parts.length, counts, stablecoinTransfers, bytes: manifest.parts.reduce((sum, part) => sum + part.bytes, 0), manifest };
}
export async function extractStage(directory: string, input: BulkConfig, source: RpcSource, progress: (value: object) => void = () => {}) {
  const config = validateBulkConfig(input);
  return runLock(directory, async () => {
    await mkdir(join(directory, "parts"), { recursive: true });
    await assertSource(source, config);
    let manifest: StageManifest;
    try { manifest = await readManifest(directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; const now = new Date().toISOString(); manifest = { version: 1, config, configHash: documentHash(config), status: "extracting", createdAt: now, updatedAt: now, sourceHost: source.host, tokens: await readTokenMetadata(source, config), parts: [] }; await atomicJson(join(directory, "manifest.json"), manifest); }
    if (manifest.configHash !== documentHash(config)) throw new Error("Run configuration changed. Use a new run ID instead of mixing selections or ranges.");
    await verifyStage(directory, false);
    const last = manifest.parts.at(-1);
    if (last) {
      const block = await source.read<RpcBlock>("eth_getBlockByNumber", [rpcQuantity(last.blockNumber), false]);
      if (block?.hash?.toLowerCase() !== last.blockHash) throw new Error("Stored checkpoint differs from Polygon. Start a new reconciled run.");
    }
    const extract = blockExtractor(source, config.concurrency);
    let previous = last?.blockHash;
    for (let number = last ? BigInt(last.blockNumber) + 1n : BigInt(config.fromBlock); number <= BigInt(config.toBlock); number++) {
      const { block, rows } = await extract(number.toString(), manifest.tokens, number === BigInt(config.fromBlock), previous);
      const text = rows.map(canonical).join("\n") + "\n", bytes = Buffer.byteLength(text);
      if (bytes > 64 * 1024 * 1024) throw new Error("Block exceeds the 64 MiB stage-part budget; no checkpoint was advanced.");
      const part: StagePart = { file: `${number}-${block.hash.slice(2).toLowerCase()}.ndjson`, sha256: digest(text), bytes, blockNumber: number.toString(), blockHash: block.hash.toLowerCase(), parentHash: block.parentHash.toLowerCase(), counts: countRecords(rows), records: rows.length };
      await atomicFile(join(directory, "parts", part.file), text);
      manifest.parts.push(part); manifest.updatedAt = new Date().toISOString();
      await atomicJson(join(directory, "manifest.json"), manifest);
      previous = part.blockHash;
      progress({ event: "block.staged", blockNumber: part.blockNumber, counts: part.counts, rpcCalls: source.calls() });
    }
    // Commit completeness only after the final boundary still matches the source.
    const boundary = await source.read<RpcBlock>("eth_getBlockByNumber", [rpcQuantity(config.toBlock), false]);
    if (boundary?.hash?.toLowerCase() !== previous) throw new Error("Final source boundary changed; the run remains incomplete.");
    manifest.status = "complete"; manifest.updatedAt = new Date().toISOString();
    await atomicJson(join(directory, "manifest.json"), manifest);
    const verified = await verifyStage(directory);
    progress({ event: "stage.verified", ...stageSummary(verified) });
    return verified;
  });
}

export function stageSummary(verified: Awaited<ReturnType<typeof verifyStage>>) {
  return { status: verified.status, fromBlock: verified.fromBlock, throughBlock: verified.throughBlock, blocks: verified.blocks, counts: verified.counts, stablecoinTransfers: verified.stablecoinTransfers, bytes: verified.bytes };
}
