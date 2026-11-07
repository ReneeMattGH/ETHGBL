import { readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { atomicJson, readPart, runLock } from "./staging";
import { verifyProtocolStage } from "./protocol-stage";
import { canonical, documentHash, type StageRecord } from "./model";
import type { ProtocolRecord } from "./protocols";
import { BULK_TABLES, bulkPhysicalTables, bulkTableAvailable, type BulkTableId, type PublishedImportDocument } from "./publication-model";
import { verifyEnrichment } from "./enrichment-stage";
import type { EnrichmentRecord } from "./enrichment";

export type PublishRecord = StageRecord | ProtocolRecord | EnrichmentRecord;
export type StoredImport = { key: string; status: string; document: PublishedImportDocument };
export type WriteResult = { txHash: string; gasCostWei: string };
export type PublicationBackend = {
  exclusive<T>(action: () => Promise<T>): Promise<T>;
  identity(): Promise<{ chainId: number; owner: string }>;
  findImport(hash: string): Promise<StoredImport | null>;
  createImport(hash: string, document: PublishedImportDocument): Promise<StoredImport>;
  patchImport(key: string, status: string, document: PublishedImportDocument): Promise<WriteResult>;
  readRange(key: string, from: number, to: number): Promise<{ ordinal: number; record: PublishRecord }[]>;
  writeRecords(key: string, rows: { ordinal: number; record: PublishRecord }[], nonce?: number): Promise<WriteResult>;
  nonces(): Promise<{ latest: number; pending: number }>;
  balance(): Promise<bigint>;
};
export type PublicationOptions = { maxSpendWei: bigint; batchSize: number; maxBatchBytes: number; enriched?: boolean; tables?: BulkTableId[] };
type PublishState = { version: 1; importHash: string; importKey: string; costWei: string; transactions: string[]; status: string; pending: { nonce: number; fromOrdinal: number; toOrdinal: number } | null; updatedAt: string };
const rowsEqual = (left: PublishRecord, right: PublishRecord) => canonical(left) === canonical(right);
export function publicationBatches(rows: { ordinal: number; record: PublishRecord }[], options: PublicationOptions) {
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 64 || !Number.isInteger(options.maxBatchBytes) || options.maxBatchBytes < 8192 || options.maxBatchBytes > 120_000 || options.maxSpendWei <= 0n) throw new Error("Invalid publication budget or batch limits.");
  const batches: typeof rows[] = []; let batch: typeof rows = [], size = 0;
  for (const row of rows) {
    if (Buffer.byteLength(row.record.sourceId, "utf8") > 128 || Buffer.byteLength(row.record.tableId, "utf8") > 128) throw new Error("Publication source identity exceeds the Arkiv str limit; use a versioned compact identity before publication.");
    const bytes = Buffer.byteLength(canonical(row.record.payload));
    if (bytes > 96_000) throw new Error(`Source record ${row.record.sourceId} needs payload splitting before publication.`);
    // Upper bound includes ABI dynamic-value padding, all twelve attributes, schema tag and operation framing.
    const upperBound = 4096 + Math.ceil(bytes / 32) * 32;
    if (upperBound > options.maxBatchBytes) throw new Error("A record exceeds the selected transaction byte budget.");
    if (batch.length && (batch.length >= options.batchSize || size + upperBound > options.maxBatchBytes)) { batches.push(batch); batch = []; size = 0; }
    batch.push(row); size += upperBound;
  }
  if (batch.length) batches.push(batch); return batches;
}
export async function publishStage(directory: string, backend: PublicationBackend, options: PublicationOptions, progress: (event: object) => void = () => {}) {
  publicationBatches([], options);
  return runLock(directory, async () => {
    const verified = await verifyProtocolStage(directory), stage = verified.source;
    const enrichment = options.enriched ? await verifyEnrichment(directory, verified) : null;
    if (options.tables?.some(t => !Object.hasOwn(BULK_TABLES, t))) throw new Error("Unknown selected publication table.");
    const selected = options.tables ? [...new Set<BulkTableId>(["polygon-blocks", ...options.tables.flatMap(t => bulkPhysicalTables(t) as BulkTableId[])])].sort() : null;
    const identity = await backend.identity();
    if (identity.chainId !== 7794095) throw new Error("Publication destination must be configured Rabdi testnet (7794095).");
    const importHash = documentHash({ version: 1, configHash: stage.manifest.configHash, sourceFingerprint: verified.manifest.sourceFingerprint, decoderHash: verified.manifest.decoderHash, ...(enrichment ? { enrichmentHash: enrichment.fingerprint } : {}), ...(selected ? { selectedTables: selected } : {}) });
    const initial: PublishedImportDocument = { version: 1, runId: basename(directory), sourceFingerprint: verified.manifest.sourceFingerprint, configHash: stage.manifest.configHash, decoderHash: verified.manifest.decoderHash, tokens: stage.manifest.tokens.map(token => ({ address: token.address, symbol: token.symbol, decimals: token.decimals, stablecoin: token.stablecoin })), counts: {}, sourceHost: stage.manifest.sourceHost, committedBlocks: 0, throughBlock: null, fromBlock: stage.fromBlock, toBlock: stage.throughBlock!, recordCount: 0, retainedDays: 30, sourceScope: "Full block transactions/receipt logs; selected ERC-20 transfers; observed QuickSwap V2/Uniswap v3 pool events and five Aave Pool actions. No traces, Algebra or Polymarket." };
    if (enrichment || selected) {
      const base = Object.fromEntries(Object.keys(BULK_TABLES).filter(t => bulkTableAvailable(initial, t)).map(t => [t, { state: "available" as const, detail: initial.sourceScope }]));
      initial.tableCoverage = { ...base, ...enrichment?.tableCoverage };
      if (enrichment) {
        initial.enrichmentHash = enrichment.fingerprint;
        initial.sourceScope = "Finalized Polygon interval; selected ERC-20 tokens; observed QuickSwap V2/Algebra V1 and Uniswap v3 pools; Aave actions and start-block reserve state; attributed current reference snapshots; top-100 sender activity; allowlisted Polymarket v1/v2 fills and CTF redemptions. Newer exchanges, global pool discovery and historical reference validity excluded. Trace capability is declared per table.";
      }
      if (selected) {
        initial.selectedTables = selected;
        initial.sourceScope = `Selected physical tables (${selected.join(", ")}). ${initial.sourceScope}`;
        for (const table of Object.keys(BULK_TABLES) as BulkTableId[]) if (initial.tableCoverage[table]?.state === "available" && !bulkPhysicalTables(table).every(t => selected.includes(t as BulkTableId))) initial.tableCoverage[table] = { state: "unavailable", detail: "Excluded from this publication selection; source staging remains local." };
      }
    }
    for (const table of options.tables ?? []) if (!bulkTableAvailable(initial, table)) throw new Error(`Selected table ${table} is unavailable: ${initial.tableCoverage?.[table]?.detail ?? "Run and verify the enrichment stage before selecting this table."}`);
    const stateFile = selected || enrichment ? `publication-${importHash.slice(0, 16)}.json` : "publication.json";
    let published = await backend.findImport(importHash);
    if (!published) published = await backend.exclusive(async () => {
      const found = await backend.findImport(importHash); if (found) return found;
      const nonces = await backend.nonces(); if (nonces.latest !== nonces.pending) throw new Error("Writer has a pending transaction; reconcile it before publication.");
      return backend.createImport(importHash, initial);
    });
    if (published.document.configHash !== initial.configHash || published.document.sourceFingerprint !== initial.sourceFingerprint || published.document.decoderHash !== initial.decoderHash || published.document.enrichmentHash !== initial.enrichmentHash || canonical(published.document.selectedTables ?? null) !== canonical(initial.selectedTables ?? null)) throw new Error("Published import differs from its verified source.");
    let state: PublishState;
    try { state = JSON.parse(await readFile(join(directory, stateFile), "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; state = { version: 1, importHash, importKey: published.key, costWei: "0", transactions: [], status: "publishing", pending: null, updatedAt: new Date().toISOString() }; }
    if (state.version !== 1 || state.importHash !== importHash || state.importKey !== published.key) throw new Error("Publication state belongs to a different source or import.");
    const save = async () => { state.updatedAt = new Date().toISOString(); await atomicJson(join(directory, stateFile), state); };
    const note = async (result: WriteResult) => { state.costWei = (BigInt(state.costWei) + BigInt(result.gasCostWei)).toString(); state.transactions.push(result.txHash); state.pending = null; await save(); };
    // Always reconcile from chain data. Local counters never authorize skipping an unverified source row.
    let ordinal = 0; const counts: Record<string, number> = {};
    for (let blockIndex = 0; blockIndex < stage.manifest.parts.length; blockIndex++) {
      const sourcePart = stage.manifest.parts[blockIndex], protocolPart = verified.manifest.parts[blockIndex];
      const raw = await readPart(directory, sourcePart), text = await readFile(join(directory, "protocols", "parts", protocolPart.file), "utf8");
      const decoded: ProtocolRecord[] = text.trim() ? text.trimEnd().split("\n").map(line => JSON.parse(line)) : [];
      const records: PublishRecord[] = [...raw, ...decoded, ...(enrichment?.rows.filter(row => row.blockNumber === sourcePart.blockNumber) ?? [])].filter(row => !selected || selected.includes(row.tableId));
      const expected = records.map(record => ({ ordinal: ordinal++, record })), fromOrdinal = expected[0].ordinal, toOrdinal = expected.at(-1)!.ordinal;
      for (const row of records) {
        counts[row.tableId] = (counts[row.tableId] ?? 0) + 1;
        if (row.tableId === "token-transfers" && (row.payload as { stablecoin?: boolean }).stablecoin) counts["stablecoin-transfers"] = (counts["stablecoin-transfers"] ?? 0) + 1;
      }
      const batches = publicationBatches(expected, options);
      if (blockIndex < published.document.committedBlocks) {
        const stored = await backend.readRange(published.key, fromOrdinal, toOrdinal), byOrdinal = new Map(stored.map(row => [row.ordinal, row.record]));
        if (stored.length !== expected.length || stored.length !== byOrdinal.size || expected.some(row => !byOrdinal.has(row.ordinal) || !rowsEqual(row.record, byOrdinal.get(row.ordinal)!))) throw new Error("Committed published block content differs from verified source.");
        if (blockIndex + 1 === published.document.committedBlocks && (published.document.recordCount !== ordinal || published.document.throughBlock !== sourcePart.blockNumber || canonical(published.document.counts) !== canonical(counts))) throw new Error("Published coverage manifest differs from its complete source prefix.");
        progress({ event: "publication.blockReconciled", importKey: published.key, throughBlock: sourcePart.blockNumber, recordCount: ordinal });
        continue;
      }
      const existing = await backend.readRange(published.key, fromOrdinal, toOrdinal), byOrdinal = new Map(existing.map(row => [row.ordinal, row.record]));
      if (existing.length !== byOrdinal.size || existing.some(row => !expected.find(wanted => wanted.ordinal === row.ordinal && rowsEqual(wanted.record, row.record)))) throw new Error("Conflicting or duplicate published source identity.");
      for (const batch of batches) {
        if (batch.every(row => byOrdinal.has(row.ordinal))) continue;
        // A block may contain thousands of rows. Release the signer after each verified batch
        // so the live tail and other imports can make progress between transactions.
        await backend.exclusive(async () => {
          const present = await backend.readRange(published!.key, batch[0].ordinal, batch.at(-1)!.ordinal);
          const byOrdinal = new Map(present.map(row => [row.ordinal, row.record]));
          if (present.length !== byOrdinal.size || present.some(row => !batch.some(wanted => wanted.ordinal === row.ordinal && rowsEqual(wanted.record, row.record)))) throw new Error("Conflicting or duplicate published source identity.");
          const missing = batch.filter(row => !byOrdinal.has(row.ordinal));
          if (!missing.length) return;
          if (BigInt(state.costWei) >= options.maxSpendWei || await backend.balance() < 10n ** 15n) { state.status = "budget-limit"; await save(); throw new Error("Publication budget reached; verified checkpoints are retained. Increase --max-spend to continue."); }
          const current = await backend.nonces(); if (current.latest !== current.pending) throw new Error("Unresolved writer transaction.");
          // Persist nonce intent before signing. A crash is reconciled by source identity and chain nonce on restart.
          state.pending = { nonce: current.latest, fromOrdinal: missing[0].ordinal, toOrdinal: missing.at(-1)!.ordinal }; await save();
          const balanceBefore = await backend.balance();
          let result: WriteResult;
          try { result = await backend.writeRecords(published!.key, missing, current.latest); }
          catch (error) {
            const balanceAfter = await backend.balance().catch(() => null);
            if (balanceAfter !== null && balanceBefore > balanceAfter) { state.costWei = (BigInt(state.costWei) + balanceBefore - balanceAfter).toString(); await save(); }
            throw error;
          }
          // Fees are spent even when subsequent content verification fails.
          await note(result);
          const stored = await backend.readRange(published!.key, missing[0].ordinal, missing.at(-1)!.ordinal);
          const storedByOrdinal = new Map(stored.map(row => [row.ordinal, row.record]));
          if (stored.length !== storedByOrdinal.size || missing.some(row => !storedByOrdinal.has(row.ordinal) || !rowsEqual(row.record, storedByOrdinal.get(row.ordinal)!))) throw new Error("Arkiv batch content readback failed; no coverage checkpoint advanced.");
          progress({ event: "publication.batchVerified", runId: initial.runId, importKey: published!.key, blockNumber: sourcePart.blockNumber, records: missing.length, txHash: result.txHash, costWei: state.costWei });
        });
        // Other processes poll the shared lock every 100 ms. Leave an acquisition
        // window after each batch instead of immediately winning the lock again.
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      const final = await backend.readRange(published.key, fromOrdinal, toOrdinal);
      if (final.length !== expected.length || new Set(final.map(row => row.ordinal)).size !== expected.length || final.some(row => !expected.some(wanted => row.ordinal === wanted.ordinal && rowsEqual(row.record, wanted.record)))) throw new Error("Published block records differ from complete verified source.");
      await backend.exclusive(async () => {
        const nonces = await backend.nonces();
        if (nonces.latest !== nonces.pending) throw new Error("Writer has an unresolved pending transaction before the coverage commit.");
        const latest = await backend.findImport(importHash); if (!latest) throw new Error("Published import disappeared before coverage commit.");
        published = latest;
        const document = { ...initial, counts: { ...counts }, committedBlocks: blockIndex + 1, throughBlock: sourcePart.blockNumber, recordCount: ordinal };
        if (blockIndex >= published!.document.committedBlocks) {
          const status = blockIndex + 1 === stage.manifest.parts.length ? "complete" : "publishing";
          await note(await backend.patchImport(published!.key, status, document));
          published = { ...published!, status, document };
        }
        state.status = published!.status; await save();
      });
      progress({ event: "publication.blockCommitted", importKey: published.key, throughBlock: sourcePart.blockNumber, recordCount: ordinal, counts: { ...counts } });
    }
    return { importKey: published.key, status: published.status, throughBlock: published.document.throughBlock, records: published.document.recordCount, counts: published.document.counts, costWei: state.costWei, transactions: state.transactions.length };
  });
}
