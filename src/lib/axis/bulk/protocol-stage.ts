import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { atomicJson, atomicText, readPart, runLock, verifyStage } from "./staging";
import { canonical, digest, documentHash, rpcQuantity, type RpcBlock } from "./model";
import { assertSource } from "./source";
import { DEPLOYMENTS, PROTOCOL_EVENTS, PROTOCOL_TABLES, decodeProtocolRecords, discoverProtocolEvidence, emptyProtocolEvidence, type ProtocolEvidence, type ProtocolRecord, type ProtocolTable } from "./protocols";
import type { RpcSource } from "./rpc";

type ProtocolPart = { file: string; sourceSha256: string; blockNumber: string; sha256: string; bytes: number; counts: Partial<Record<ProtocolTable, number>> };
export type ProtocolManifest = { version: 1; decoderHash: string; sourceFingerprint: string; sourceConfigHash: string; status: "decoding" | "complete"; evidence: ProtocolEvidence; parts: ProtocolPart[]; updatedAt: string };
const decoderHash = () => documentHash({ version: 1, evidencePolicy: 2, deployments: DEPLOYMENTS, events: PROTOCOL_EVENTS });
const fingerprint = (stage: Awaited<ReturnType<typeof verifyStage>>) => documentHash(stage.manifest.parts.map(part => ({ file: part.file, sha256: part.sha256 })));
const countsOf = (rows: ProtocolRecord[]) => {
  const counts: Partial<Record<ProtocolTable, number>> = {};
  for (const row of rows) counts[row.tableId] = (counts[row.tableId] ?? 0) + 1;
  return counts;
};
async function readProtocolManifest(directory: string): Promise<ProtocolManifest> {
  const manifest = JSON.parse(await readFile(join(directory, "protocols", "manifest.json"), "utf8")) as ProtocolManifest;
  if (manifest.version !== 1 || manifest.decoderHash !== decoderHash() || !["decoding", "complete"].includes(manifest.status) || !Array.isArray(manifest.parts) || !manifest.evidence?.pools || !manifest.evidence?.rejectedPools || Array.isArray(manifest.evidence.rejectedPools) || !manifest.evidence?.aaveBlocks) throw new Error("Invalid or obsolete protocol manifest. Use a new run for a changed decoder.");
  return manifest;
}
export async function verifyProtocolStage(directory: string, requireComplete = true, verifiedSource?: Awaited<ReturnType<typeof verifyStage>>) {
  const stage = verifiedSource ?? await verifyStage(directory), manifest = await readProtocolManifest(directory);
  if (manifest.sourceConfigHash !== stage.manifest.configHash || manifest.sourceFingerprint !== fingerprint(stage)) throw new Error("Protocol output belongs to a different source extraction.");
  if (requireComplete && manifest.status !== "complete") throw new Error("Protocol decoding is incomplete.");
  if (manifest.parts.length > stage.manifest.parts.length || manifest.status === "complete" && manifest.parts.length !== stage.manifest.parts.length) throw new Error("Protocol coverage differs from the source interval.");
  const seenPools = new Set<string>(), counts: Partial<Record<ProtocolTable, number>> = {};
  for (const [index, part] of manifest.parts.entries()) {
    const source = stage.manifest.parts[index];
    if (part.file !== source.file || part.sourceSha256 !== source.sha256 || part.blockNumber !== source.blockNumber) throw new Error("Protocol part does not match its source part.");
    const path = join(directory, "protocols", "parts", part.file), info = await stat(path);
    if (info.size !== part.bytes || info.size > 64 * 1024 * 1024) throw new Error("Protocol part size differs from manifest.");
    const text = await readFile(path, "utf8");
    if (digest(text) !== part.sha256) throw new Error("Protocol part checksum mismatch.");
    const rows: ProtocolRecord[] = text.trim() ? text.trimEnd().split("\n").map(line => JSON.parse(line)) : [];
    const expected = decodeProtocolRecords(await readPart(directory, source), manifest.evidence, seenPools);
    if (canonical(expected) !== canonical(rows) || canonical(countsOf(rows)) !== canonical(part.counts)) throw new Error("Protocol records do not match source logs and membership evidence.");
    for (const [table, count] of Object.entries(part.counts)) counts[table as ProtocolTable] = (counts[table as ProtocolTable] ?? 0) + count;
  }
  return { manifest, source: stage, counts: Object.fromEntries(PROTOCOL_TABLES.map(table => [table, counts[table] ?? 0])) as Record<ProtocolTable, number>, views: { "dex-trades": (counts["quickswap-swaps"] ?? 0) + (counts["uniswap_v3-swaps"] ?? 0), "lending-actions": PROTOCOL_TABLES.filter(table => table.startsWith("aave-")).reduce((sum, table) => sum + (counts[table] ?? 0), 0) } };
}
export async function decodeStageProtocols(directory: string, source: RpcSource, progress: (value: object) => void = () => {}) {
  return runLock(directory, async () => {
    const stage = await verifyStage(directory);
    let manifest: ProtocolManifest;
    try { manifest = await readProtocolManifest(directory); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(join(directory, "protocols", "parts"), { recursive: true });
      manifest = { version: 1, decoderHash: decoderHash(), sourceFingerprint: fingerprint(stage), sourceConfigHash: stage.manifest.configHash, status: "decoding", evidence: emptyProtocolEvidence(), parts: [], updatedAt: new Date().toISOString() };
      await atomicJson(join(directory, "protocols", "manifest.json"), manifest);
    }
    await verifyProtocolStage(directory, false, stage);
    if (manifest.status !== "complete") {
      await assertSource(source, stage.manifest.config);
      const seenPools = new Set<string>();
      for (let index = 0; index < manifest.parts.length; index++) decodeProtocolRecords(await readPart(directory, stage.manifest.parts[index]), manifest.evidence, seenPools);
      for (const sourcePart of stage.manifest.parts.slice(manifest.parts.length)) {
        const rows = await readPart(directory, sourcePart);
        await discoverProtocolEvidence(rows, manifest.evidence, source);
        const decoded = decodeProtocolRecords(rows, manifest.evidence, seenPools), text = decoded.length ? decoded.map(canonical).join("\n") + "\n" : "";
        const part: ProtocolPart = { file: sourcePart.file, sourceSha256: sourcePart.sha256, blockNumber: sourcePart.blockNumber, sha256: digest(text), bytes: Buffer.byteLength(text), counts: countsOf(decoded) };
        if (part.bytes > 64 * 1024 * 1024) throw new Error("Decoded protocol part exceeds its byte budget.");
        await atomicText(join(directory, "protocols", "parts", part.file), text);
        manifest.parts.push(part); manifest.updatedAt = new Date().toISOString();
        await atomicJson(join(directory, "protocols", "manifest.json"), manifest);
        progress({ event: "protocols.blockDecoded", blockNumber: part.blockNumber, counts: part.counts });
      }
      const boundary = await source.read<RpcBlock>("eth_getBlockByNumber", [rpcQuantity(stage.throughBlock!), false]);
      if (boundary.hash.toLowerCase() !== stage.manifest.parts.at(-1)!.blockHash) throw new Error("Source boundary changed during protocol enrichment.");
      manifest.status = "complete"; manifest.updatedAt = new Date().toISOString();
      await atomicJson(join(directory, "protocols", "manifest.json"), manifest);
    }
    const result = await verifyProtocolStage(directory, true, stage);
    return { status: result.manifest.status, fromBlock: stage.fromBlock, throughBlock: stage.throughBlock, counts: result.counts, views: result.views, poolCoverage: "observed active pools; not a complete factory registry", decoderScope: "QuickSwap V2 pool events, Uniswap v3 pool events, five Aave v3 Pool action events", rpcCalls: source.calls(), publication: "local-only" };
  });
}
