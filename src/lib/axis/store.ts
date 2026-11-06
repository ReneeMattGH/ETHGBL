import { runQuery } from "@arkiv-network/sdk/query";
import type { Entity } from "@arkiv-network/sdk";
import { hexToString, type Hex } from "viem";
import { arkivReader, retryRead, writerAddress } from "./runtime";
import { aggregateTransfers, validateFilters, validateDashboard } from "./core";
import { MAX_SCOPE_ROWS, USDC, type Dataset, type Coverage, type CoverageSummary, type Transfer, type Filters, type SavedDocument, type SavedQuery, type Job } from "./model";
import { readState } from "./queue";

export const FULL_SELECT = { key: true, owner: true, creator: true, expiresAt: true, attributes: true, attributeSchema: true } as const;
export const literal = (value: string) => `str('${value.replace(/'/g, "''")}')`;
export function assertKey(value: string): asserts value is Hex { if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error("Invalid Arkiv entity key."); }
export function baseQuery(schema: string, owner?: string) {
  if (owner && !/^0x[0-9a-fA-F]{40}$/.test(owner)) throw new Error("Invalid owner address.");
  return `arkiv.schema = ${literal(schema)}${owner ? ` AND $owner = addr(${owner})` : ""}`;
}
export async function pageEntities(predicate: string, limit = 100, offset = 0, order = "$key:key ASC") {
  return retryRead(() => runQuery(arkivReader(), { query: `${predicate} ORDER BY ${order}`, select: FULL_SELECT, limit, offset, count: true }));
}
export async function scanEntities(predicate: string, cap = MAX_SCOPE_ROWS): Promise<Entity[]> {
  const result: Entity[] = []; let cursor: string | undefined;
  while (true) {
    const response = await pageEntities(`${predicate}${cursor ? ` AND $key > key(${cursor})` : ""}`);
    if (result.length + response.entities.length > cap) throw new Error(`This query exceeds the local limit of ${cap} rows. Narrow the dataset scope; no partial total was calculated.`);
    result.push(...response.entities);
    if (response.entities.length < 100) return result;
    const next = response.entities.at(-1)?.key;
    if (!next || next === cursor) throw new Error("Arkiv pagination did not advance.");
    cursor = next;
  }
}
export function unpack(entity: Entity): Record<string, string | boolean> {
  return Object.fromEntries(Object.entries(entity.attributes ?? {}).map(([name, item]) => [name, typeof item.value === "boolean" ? item.value : String(item.value)]));
}
export function documentOf<T>(entity: Entity): T {
  const field = entity.attributes?.document;
  if (!field || field.type !== "bytes") throw new Error("Arkiv entity has no document.");
  return JSON.parse(hexToString(field.value)) as T;
}
export function meta(entity: Entity) { return { key: String(entity.key), owner: String(entity.owner).toLowerCase(), creator: String(entity.creator).toLowerCase(), expiresAt: String(entity.expiresAt) }; }
export async function getEntity(schema: string, entityKey: string, owner?: string) {
  assertKey(entityKey);
  const result = await pageEntities(`${baseQuery(schema, owner)} AND $key = key(${entityKey})`, 1);
  if (!result.entities[0]) throw new Error("Entity is missing, deleted, or expired on Arkiv.");
  return result.entities[0];
}
export function datasetOf(entity: Entity): Dataset {
  const a = unpack(entity), doc = documentOf<{ description: string; ingestionChunkBlocks?: number }>(entity);
  const chunkBlocks = doc.ingestionChunkBlocks ?? 10;
  if (!Number.isInteger(chunkBlocks) || chunkBlocks < 1 || chunkBlocks > 10) throw new Error("Ingestion chunks must contain 1–10 blocks.");
  if (Number(a.chainId) !== 137 || String(a.contract).toLowerCase() !== USDC) throw new Error("Unsupported dataset source.");
  return { ...meta(entity), name: String(a.name), description: String(doc.description ?? ""), chainId: Number(a.chainId), contract: String(a.contract).toLowerCase(), writer: String(a.writer).toLowerCase(), startBlock: String(a.startBlock), endBlock: String(a.endBlock), enabled: a.enabled === true, continuous: a.continuous === true, createdAt: new Date(Number(a.sourceTime) * 1000).toISOString(), chunkBlocks };
}
export async function listDatasets() { return (await scanEntities(baseQuery("axis.dataset.v1") + ` AND writer = addr(${writerAddress()})`, 1000)).map(datasetOf); }
export async function getDataset(entityKey: string) {
  const dataset = datasetOf(await getEntity("axis.dataset.v1", entityKey));
  if (dataset.writer !== writerAddress()) throw new Error("Dataset is assigned to a different indexer.");
  return dataset;
}
export async function listCoverage(datasetKey: string): Promise<Coverage[]> {
  assertKey(datasetKey);
  return (await scanEntities(`${baseQuery("axis.coverage.v1", writerAddress())} AND datasetKey = key(${datasetKey}) AND verified = true`)).map(entity => {
    const a = unpack(entity), doc = documentOf<{ blockHashes: Record<string, string>; transactionHashes: string[]; verifiedAt: string }>(entity);
    return { ...meta(entity), datasetKey, fromBlock: String(a.fromBlock), toBlock: String(a.toBlock), rows: Number(a.rows), contentHash: String(a.contentHash), ...doc };
  }).sort((a, b) => BigInt(a.fromBlock) < BigInt(b.fromBlock) ? -1 : 1);
}
export async function coverageSummary(dataset: Dataset): Promise<CoverageSummary> {
  const manifests = await listCoverage(dataset.key);
  let next = BigInt(dataset.startBlock), expectedRows = 0;
  const gaps: string[] = [];
  const alerts = await scanEntities(`${baseQuery("axis.coverage_alert.v1", writerAddress())} AND datasetKey = key(${dataset.key})`, 100);
  const localAlert = await readState<{ reason: string } | null>("source-alert-" + dataset.key, null);
  if (alerts.length || localAlert) gaps.push("A source consistency failure invalidated this dataset. Pause it and publish a new verified dataset revision.");
  for (const item of manifests) {
    if (BigInt(item.fromBlock) !== next) { gaps.push(`Non-contiguous or overlapping coverage at ${item.fromBlock}; expected ${next}.`); break; }
    next = BigInt(item.toBlock) + 1n; expectedRows += item.rows;
  }
  const throughBlock = next > BigInt(dataset.startBlock) ? (next - 1n).toString() : null;
  const requestedThrough = dataset.endBlock === "0" ? (throughBlock ?? dataset.startBlock) : dataset.endBlock;
  const count = throughBlock ? await pageEntities(`${transferBase(dataset.key)} AND blockNumber >= u64(${dataset.startBlock}) AND blockNumber <= u64(${throughBlock})`, 1) : null;
  const actualRows = Number(count?.count ?? 0);
  if (actualRows !== expectedRows) gaps.push(`Coverage expects ${expectedRows} transfers but Arkiv has ${actualRows}. Records may be expired or unavailable; reconcile before calculating totals.`);
  return { complete: gaps.length === 0 && throughBlock !== null && BigInt(throughBlock) >= BigInt(requestedThrough), fromBlock: dataset.startBlock, throughBlock, requestedThrough, expectedRows, actualRows, gaps, manifests };
}
export const transferBase = (datasetKey: string) => { assertKey(datasetKey); return `${baseQuery("axis.transfer.v1", writerAddress())} AND datasetKey = key(${datasetKey})`; };
export function transferOf(entity: Entity): Transfer {
  const a = unpack(entity);
  return { entityKey: String(entity.key), sourceId: String(a.sourceId), chainId: Number(a.chainId), contract: String(a.contract).toLowerCase(), blockNumber: String(a.blockNumber), blockHash: String(a.blockHash), timestamp: String(a.sourceTime), txHash: String(a.txHash), txIndex: a.txIndex === undefined ? null : Number(a.txIndex), logIndex: Number(a.logIndex), sender: String(a.sender).toLowerCase(), recipient: String(a.recipient).toLowerCase(), amountRaw: String(a.amountRaw), amount: String(a.amount), decimals: Number(a.decimals), contentHash: String(a.contentHash) };
}
export function filteredQuery(dataset: Dataset, coverage: CoverageSummary, filters: Filters) {
  if (!coverage.throughBlock) throw new Error("No verified coverage yet. Run ingestion first.");
  if (coverage.gaps.length) throw new Error(coverage.gaps.join(" "));
  const clauses = [transferBase(dataset.key), `blockNumber >= u64(${dataset.startBlock})`, `blockNumber <= u64(${coverage.throughBlock})`];
  for (const [field, attribute, operator] of [["fromBlock", "blockNumber", ">="], ["toBlock", "blockNumber", "<="], ["fromTime", "sourceTime", ">="], ["toTime", "sourceTime", "<="]] as const) if (filters[field]) clauses.push(`${attribute} ${operator} u64(${filters[field]})`);
  if (filters.fromBlock && BigInt(filters.fromBlock) < BigInt(dataset.startBlock) || filters.toBlock && BigInt(filters.toBlock) > BigInt(coverage.throughBlock)) throw new Error("Requested blocks fall outside verified coverage.");
  for (const field of ["sender", "recipient"] as const) if (filters[field]) clauses.push(`${field} = addr(${filters[field]})`);
  if (filters.predicate) clauses.push(`(${filters.predicate})`);
  return clauses.join(" AND ");
}
export async function executeQuery(datasetKey: string, input: unknown, mode: "page" | "analytics" | "export", offset = 0, limit = 25) {
  const filters = validateFilters(input), dataset = await getDataset(datasetKey), coverage = await coverageSummary(dataset);
  if (filters.lookbackBlocks && coverage.throughBlock) {
    const start = BigInt(coverage.throughBlock) - BigInt(filters.lookbackBlocks) + 1n;
    filters.fromBlock = (start > BigInt(dataset.startBlock) ? start : BigInt(dataset.startBlock)).toString();
    filters.toBlock = coverage.throughBlock;
  }
  const predicate = filteredQuery(dataset, coverage, filters);
  const order = `blockNumber:u64 ${filters.order === "asc" ? "ASC" : "DESC"}`;
  const scope = { fromBlock: filters.fromBlock ?? dataset.startBlock, toBlock: filters.toBlock ?? coverage.throughBlock, fromTime: filters.fromTime ?? null, toTime: filters.toTime ?? null };
  if (mode === "page") {
    const response = await pageEntities(predicate, limit, offset, order);
    return { dataset, coverage, scope, entities: response.entities.map(transferOf), total: response.count?.toString() ?? null, blockNumber: response.blockNumber.toString(), executedQuery: `${predicate} ORDER BY ${order}`, offset, limit, fetchedAt: new Date().toISOString() };
  }
  const rows = (await scanEntities(predicate)).map(transferOf);
  const expected = await pageEntities(predicate, 1);
  if (BigInt(rows.length) !== (expected.count ?? 0n)) throw new Error("Dataset changed during the scan. Refresh to obtain a consistent result.");
  return { dataset, coverage, scope, analytics: aggregateTransfers(rows), ...(mode === "export" ? { entities: rows } : {}), executedQuery: `${predicate} ORDER BY $key:key ASC`, blockNumber: expected.blockNumber.toString(), scannedRows: rows.length, fetchedAt: new Date().toISOString() };
}
export async function listDashboards(): Promise<SavedDocument[]> { return (await scanEntities(`${baseQuery("axis.dashboard.v1")} AND published = true`, 1000)).map(dashboardOf).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
export function dashboardOf(entity: Entity): SavedDocument { const a = unpack(entity); return { ...meta(entity), title: String(a.title), document: validateDashboard(documentOf(entity)), updatedAt: new Date(Number(a.sourceTime) * 1000).toISOString() }; }
export async function getDashboard(entityKey: string) { return dashboardOf(await getEntity("axis.dashboard.v1", entityKey)); }
export async function savedQueries(owner: string): Promise<SavedQuery[]> { return (await scanEntities(baseQuery("axis.saved_query.v1", owner), 500)).map(entity => ({ ...meta(entity), title: String(unpack(entity).title), query: documentOf(entity) })); }
export async function publishedJobs(): Promise<Job[]> { return (await scanEntities(baseQuery("axis.ingestion_status.v1", writerAddress()), 1000)).map(entity => ({ ...documentOf<Job>(entity), statusKey: String(entity.key) })); }
