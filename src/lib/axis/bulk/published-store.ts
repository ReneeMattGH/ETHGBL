import { baseQuery, pageEntities, unpack, documentOf, assertKey, literal } from "../store";
import { writerAddress } from "../runtime";
import { BULK_IMPORT_SCHEMA, BULK_RECORD_SCHEMA, BULK_TABLES, bulkPhysicalTables, bulkTableAvailable, expectedTableCount, type BulkTableId, type PublishedImport, type PublishedImportDocument } from "./publication-model";
import type { Entity } from "@arkiv-network/sdk";

function importOf(entity: Entity): PublishedImport {
  const a = unpack(entity), document = documentOf<PublishedImportDocument>(entity);
  if (document.version !== 1 || Number(a.chainId) !== 137 || !Number.isSafeInteger(document.recordCount) || document.recordCount < 0 || !Number.isSafeInteger(document.committedBlocks) || document.committedBlocks < 0 || !/^\d+$/.test(document.fromBlock) || !/^\d+$/.test(document.toBlock) || document.throughBlock !== null && (!/^\d+$/.test(document.throughBlock) || BigInt(document.throughBlock) < BigInt(document.fromBlock) || BigInt(document.throughBlock) > BigInt(document.toBlock)) || !document.counts || Object.values(document.counts).some(count => !Number.isSafeInteger(count) || count < 0)) throw new Error("Invalid published import manifest.");
  return { key: String(entity.key), name: String(a.name), owner: String(entity.owner).toLowerCase(), status: String(a.status), expiresAt: String(entity.expiresAt), document };
}
export async function listPublishedImports() {
  const result = await pageEntities(baseQuery(BULK_IMPORT_SCHEMA, writerAddress()), 100);
  return result.entities.map(importOf);
}
export async function getPublishedImport(importKey: string) {
  assertKey(importKey);
  const result = await pageEntities(`${baseQuery(BULK_IMPORT_SCHEMA, writerAddress())} AND $key = key(${importKey})`, 1);
  if (!result.entities[0]) throw new Error("Published bulk import is missing or expired.");
  return importOf(result.entities[0]);
}
export function bulkTableQuery(tableId: BulkTableId, imported: PublishedImport) {
  const doc = imported.document;
  if (!bulkTableAvailable(doc, tableId)) throw new Error(doc.tableCoverage?.[tableId]?.detail ?? "This table is not included in this verified import.");
  if (!doc.throughBlock || !doc.committedBlocks || !doc.recordCount) throw new Error("No verified published block is available yet.");
  const tableFilter = bulkPhysicalTables(tableId).map(id => `tableId = ${literal(id)}`).join(" OR ");
  return `${baseQuery(BULK_RECORD_SCHEMA, writerAddress())} AND importKey = key(${imported.key}) AND ordinal < u64(${doc.recordCount}) AND blockNumber >= u64(${doc.fromBlock}) AND blockNumber <= u64(${doc.throughBlock}) AND (${tableFilter})${tableId === "stablecoin-transfers" ? " AND stablecoin = true" : ""}`;
}
export function bulkPreviewValues(entity: Entity) {
  const attributes = unpack(entity), payload = documentOf<Record<string, unknown>>(entity);
  const args = payload.args && typeof payload.args === "object" ? payload.args as Record<string, unknown> : {};
  const transaction = payload.transaction && typeof payload.transaction === "object" ? payload.transaction as Record<string, unknown> : {};
  const receipt = payload.receipt && typeof payload.receipt === "object" ? payload.receipt as Record<string, unknown> : {};
  const values: Record<string, string | boolean> = {};
  for (const [name, value] of Object.entries({ ...payload, ...transaction, status: receipt.status ?? payload.status ?? "", ...args, ...attributes, timestamp: attributes.sourceTime, event: payload.event ?? (attributes.tableId === "token-transfers" ? "Transfer" : ""), details: Object.keys(args).length ? args : payload })) {
    if (name === "document") continue;
    values[name] = typeof value === "boolean" ? value : typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
  }
  return { key: String(entity.key), values };
}
export async function bulkCatalogPreview(tableId: string, importKey: string, offset = 0) {
  if (!Object.hasOwn(BULK_TABLES, tableId)) throw new Error("This catalog table is not indexed by the bulk pipeline.");
  if (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000) throw new Error("Invalid preview offset.");
  const table = tableId as BulkTableId, imported = await getPublishedImport(importKey), predicate = bulkTableQuery(table, imported);
  const result = await pageEntities(predicate, 10, offset, "ordinal:u64 DESC");
  if (result.count === undefined || Number(result.count) !== expectedTableCount(imported.document, table)) throw new Error("Published coverage count differs from stored Arkiv records. Records may have expired; reconcile this import.");
  return { tableId, scope: { kind: "bulk" as const, datasetKey: importKey, name: imported.name, fromBlock: imported.document.fromBlock, throughBlock: imported.document.throughBlock!, rows: Number(result.count) }, rows: result.entities.map(bulkPreviewValues), fields: Object.entries(result.entities[0]?.attributeSchema ?? {}).map(([name, field]) => ({ name, type: field.type, indexed: field.indexed ?? false })), total: result.count.toString(), offset, limit: 10, executedQuery: `${predicate} ORDER BY ordinal:u64 DESC`, blockNumber: result.blockNumber.toString(), fetchedAt: new Date().toISOString(), sourceScope: imported.document.sourceScope };
}
