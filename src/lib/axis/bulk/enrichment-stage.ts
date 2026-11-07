import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicJson, readPart, runLock } from "./staging";
import { verifyProtocolStage } from "./protocol-stage";
import { canonical, digest, documentHash, type StageRecord } from "./model";
import { RpcFailure, type RpcSource } from "./rpc";
import { safeError } from "../runtime";
import { decodeExtraProtocols, enrichmentCoverage, enrichmentDecoderHash, marketRecords, ratingRecords, referenceRecords, reserveRecords, traceRecords, type EnrichmentIO, type EnrichmentRecord } from "./enrichment";
import type { BulkTableId, TableCoverage } from "./publication-model";

type Evidence = { kind: "rpc" | "json"; request: unknown; value: unknown; fetchedAt: string; sha256: string; rawText?: string; bodySha256?: string; error?: { message: string; code?: number } };
// Retain exact non-integer and oversized numeric lexemes from reference APIs.
export function parseReferenceJson(text: string): unknown {
  return JSON.parse(text.replace(/("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, (match, quoted: string | undefined, numeric: string | undefined) => quoted ?? (!/[.eE]/.test(numeric!) && Number.isSafeInteger(Number(numeric)) ? match : JSON.stringify(numeric))));
}
type Inputs = { sourceFingerprint: string; decoderHash: string; enrichmentDecoderHash: string; traces: boolean };
export type EnrichmentManifest = { version: 1; inputs: Inputs; fingerprint: string; rowsHash: string; rows: EnrichmentRecord[]; counts: Partial<Record<BulkTableId, number>>; tableCoverage: Partial<Record<BulkTableId, TableCoverage>>; traceError: string | null; createdAt: string };
const deniedTrace = (error: unknown): error is RpcFailure => error instanceof RpcFailure && (error.code === -32601 || /not (?:available|supported)|plan|tier|access|disabled|not found/i.test(error.message));
function evidenceIO(evidence: Record<string, Evidence>, source?: RpcSource, save?: () => Promise<void>): EnrichmentIO {
  const resolve = async (kind: Evidence["kind"], request: unknown, action: () => Promise<Omit<Evidence, "kind" | "request">>) => {
    const key = documentHash({ kind, request });
    let found = evidence[key];
    if (!found) {
      if (!source) throw new Error("Enrichment replay is missing retained source evidence.");
      found = { kind, request, ...await action() }; evidence[key] = found; await save?.();
    }
    if (found.kind !== kind || canonical(found.request) !== canonical(request) || found.sha256 !== documentHash(found.value)) throw new Error("Enrichment source evidence checksum/identity mismatch.");
    if (found.rawText !== undefined && (found.bodySha256 !== digest(found.rawText) || canonical(parseReferenceJson(found.rawText)) !== canonical(found.value))) throw new Error("Reference response differs from its retained raw body.");
    if (found.error) throw new RpcFailure(found.error.message, found.error.code);
    return found;
  };
  return {
    rpc: async <T>(method: string, params: unknown[]) => {
      const found = await resolve("rpc", { method, params }, async () => {
        try { const value = await source!.read(method, params); return { value, fetchedAt: new Date().toISOString(), sha256: documentHash(value) }; }
        catch (error) { if (method !== "debug_traceTransaction" || !deniedTrace(error)) throw error; return { value: null, fetchedAt: new Date().toISOString(), sha256: documentHash(null), error: { message: safeError(error), ...(error.code === undefined ? {} : { code: error.code }) } }; }
      }); return structuredClone(found.value) as T;
    },
    json: async url => {
      const found = await resolve("json", url, async () => {
        // URLs are adapter-owned constants or exact address/token lookups, never caller-provided credentials.
        const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (!response.ok && !(response.status === 404 && url.startsWith("https://sourcify.dev/"))) throw new Error(`Reference source HTTP ${response.status}: ${new URL(url).host}`);
        const reader = response.body?.getReader(); if (!reader) throw new Error("Reference source returned no body.");
        const chunks: Uint8Array[] = []; let bytes = 0;
        try { for (;;) { const item = await reader.read(); if (item.done) break; bytes += item.value.length; if (bytes > 8 * 1024 * 1024) { await reader.cancel(); throw new Error("Reference source exceeds its byte budget."); } chunks.push(item.value); } }
        finally { reader.releaseLock(); }
        const text = Buffer.concat(chunks).toString("utf8"), value = response.status === 404 ? { notVerified: true } : parseReferenceJson(text);
        return { value, sha256: documentHash(value), fetchedAt: new Date().toISOString(), ...(response.status === 404 ? {} : { rawText: text, bodySha256: digest(text) }) };
      });
      return { value: structuredClone(found.value), sha256: found.bodySha256 ?? found.sha256, fetchedAt: found.fetchedAt };
    },
  };
}
async function derive(directory: string, verified: Awaited<ReturnType<typeof verifyProtocolStage>>, io: EnrichmentIO, traces: boolean, progress: (event: object) => void = () => {}) {
  const first = (await readPart(directory, verified.source.manifest.parts[0]))[0], rows: EnrichmentRecord[] = [], transactions: StageRecord[] = [], seenPools = new Set<string>();
  rows.push(...await referenceRecords(first, verified.source.manifest.tokens, io));
  rows.push(...await reserveRecords(first, io));
  let traceError: string | null = null; const traced: EnrichmentRecord[] = [];
  for (const part of verified.source.manifest.parts) {
    const raw = await readPart(directory, part);
    rows.push(...await decodeExtraProtocols(raw, verified.manifest.evidence, io, seenPools));
    const txs = raw.filter(r => r.tableId === "polygon-transactions"); transactions.push(...txs);
    if (traces && !traceError) {
      try { for (const tx of txs) traced.push(...traceRecords(tx, await io.rpc("debug_traceTransaction", [tx.txHash, { tracer: "callTracer", timeout: "10s" }]))); }
      catch (error) { if (!deniedTrace(error)) throw error; traceError = safeError(error); traced.length = 0; }
    }
    progress({ event: "enrichment.blockDecoded", blockNumber: part.blockNumber });
  }
  rows.push(...await marketRecords(first, rows, io), ...ratingRecords(first, transactions, verified.source.throughBlock!), ...traced);
  // Canonical order places snapshots before event data at the first source block; stable on offline replay.
  rows.sort((a, b) => BigInt(a.blockNumber) < BigInt(b.blockNumber) ? -1 : BigInt(a.blockNumber) > BigInt(b.blockNumber) ? 1 : a.tableId.localeCompare(b.tableId) || a.sourceId.localeCompare(b.sourceId));
  const identities = new Set<string>(), counts: EnrichmentManifest["counts"] = {};
  for (const row of rows) {
    const id = `${row.tableId}:${row.sourceId}`;
    if (identities.has(id)) throw new Error("Duplicate enrichment source identity."); identities.add(id);
    counts[row.tableId] = (counts[row.tableId] ?? 0) + 1;
  }
  return { rows, counts, tableCoverage: enrichmentCoverage(traces, traceError), traceError };
}
const inputsFor = (v: Awaited<ReturnType<typeof verifyProtocolStage>>, traces: boolean): Inputs => ({ sourceFingerprint: v.manifest.sourceFingerprint, decoderHash: v.manifest.decoderHash, enrichmentDecoderHash: enrichmentDecoderHash(), traces });
export async function verifyEnrichment(directory: string, verified?: Awaited<ReturnType<typeof verifyProtocolStage>>) {
  const v = verified ?? await verifyProtocolStage(directory);
  const manifest = JSON.parse(await readFile(join(directory, "enrichment", "manifest.json"), "utf8")) as EnrichmentManifest;
  if (manifest.version !== 1 || canonical(manifest.inputs) !== canonical(inputsFor(v, manifest.inputs.traces))) throw new Error("Enrichment belongs to a different or obsolete source/decoder.");
  const evidence = JSON.parse(await readFile(join(directory, "enrichment", "evidence.json"), "utf8")) as Record<string, Evidence>;
  const replay = await derive(directory, v, evidenceIO(evidence), manifest.inputs.traces);
  if (manifest.rowsHash !== digest(canonical(replay.rows)) || canonical({ rows: manifest.rows, counts: manifest.counts, tableCoverage: manifest.tableCoverage, traceError: manifest.traceError }) !== canonical(replay) || manifest.fingerprint !== documentHash({ inputs: manifest.inputs, evidenceHash: documentHash(evidence), rowsHash: manifest.rowsHash, tableCoverage: manifest.tableCoverage })) throw new Error("Enrichment output differs from retained evidence and source logs.");
  return manifest;
}
export async function enrichStage(directory: string, source: RpcSource, traces = false, progress: (event: object) => void = () => {}) {
  return runLock(directory, async () => {
    const verified = await verifyProtocolStage(directory), inputs = inputsFor(verified, traces), base = join(directory, "enrichment");
    try { const existing = await verifyEnrichment(directory, verified); if (canonical(existing.inputs) !== canonical(inputs)) throw new Error("Enrichment options changed; use a new run."); return existing; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await mkdir(base, { recursive: true });
    let evidence: Record<string, Evidence> = {};
    try { const saved = JSON.parse(await readFile(join(base, "inputs.json"), "utf8")); if (canonical(saved) !== canonical(inputs)) throw new Error("Retained enrichment evidence uses different inputs."); evidence = JSON.parse(await readFile(join(base, "evidence.json"), "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await atomicJson(join(base, "inputs.json"), inputs);
    const io = evidenceIO(evidence, source, () => atomicJson(join(base, "evidence.json"), evidence));
    if (await source.read<string>("eth_chainId", []) !== "0x89") throw new Error("Enrichment source must be Polygon mainnet.");
    const result = await derive(directory, verified, io, traces, progress), rowsHash = digest(canonical(result.rows));
    const manifest: EnrichmentManifest = { version: 1, inputs, ...result, rowsHash, fingerprint: documentHash({ inputs, evidenceHash: documentHash(evidence), rowsHash, tableCoverage: result.tableCoverage }), createdAt: new Date().toISOString() };
    await atomicJson(join(base, "manifest.json"), manifest);
    return verifyEnrichment(directory, verified);
  });
}
