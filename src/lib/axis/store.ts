import type { RpcSelect } from "@arkiv-network/sdk/query";
import { queryArkiv } from "./arkiv-read";
import { scanKeyRanges } from "./key-scan";
import type { Entity } from "@arkiv-network/sdk";
import { hexToString, type Hex } from "viem";
import { writerAddress } from "./runtime";
import { aggregateTransfers, validateFilters, validateDashboard, validateQuerySources } from "./core";
import { MAX_SCOPE_ROWS, USDC, type Dataset, type Coverage, type CoverageSummary, type Transfer, type Filters, type SavedDocument, type SavedQuery, type Job, type QueryResult } from "./model";
import { readState } from "./queue";
import { compileAttributeConditions } from "./query-filters";
import { transferAttributeFields } from "./schemas";
import { datasetScopes, validateResultScopes } from "./query-scope";

type QueryMode = "page" | "analytics" | "export";
type PageQueryResult = QueryResult & { entities: Transfer[]; total: string | null; offset: number; limit: number };
type AnalyticsQueryResult = QueryResult & { analytics: NonNullable<QueryResult["analytics"]>; scannedRows: number };
type ExportQueryResult = AnalyticsQueryResult & { entities: Transfer[] };

export const FULL_SELECT = { key: true, owner: true, creator: true, expiresAt: true, attributes: true, attributeSchema: true } as const;
const SCAN_SELECT = { key: true, owner: true, creator: true, expiresAt: true, attributes: true } as const;
export const TRANSFER_SELECT = { key: true, attributes: Object.fromEntries(["datasetKey", "sourceId", "chainId", "contract", "blockNumber", "blockHash", "sourceTime", "txHash", "txIndex", "logIndex", "sender", "recipient", "amountRaw", "amount", "decimals", "contentHash"].map(field => [field, true])) } as const;
export const literal = (value: string) => `str('${value.replace(/'/g, "''")}')`;
export function assertKey(value: string): asserts value is Hex { if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error("Invalid Arkiv entity key."); }
export function baseQuery(schema: string, owner?: string) {
  if (owner && !/^0x[0-9a-fA-F]{40}$/.test(owner)) throw new Error("Invalid owner address.");
  return `arkiv.schema = ${literal(schema)}${owner ? ` AND $owner = addr(${owner})` : ""}`;
}
type ReadOptions = { count?: boolean; select?: RpcSelect };
export async function pageEntities(predicate: string, limit = 100, offset = 0, order = "$key:key ASC", options: ReadOptions = {}) {
  return queryArkiv({ query: `${predicate} ORDER BY ${order}`, select: options.select ?? FULL_SELECT, limit, offset, count: options.count ?? true });
}
export async function countEntities(predicate: string) {
  const response = await queryArkiv({ query: predicate, select: {}, count: true });
  if (response.count === undefined || response.count < 0n) throw new Error("Arkiv did not return a valid record count.");
  return response;
}
export async function scanEntities(predicate: string, cap = MAX_SCOPE_ROWS, options: { parallel?: boolean; select?: RpcSelect } = {}): Promise<Entity[]> {
  return scanKeyRanges(predicate, query => pageEntities(query, 100, 0, "$key:key ASC", { count: false, select: options.select ?? SCAN_SELECT }), cap, options.parallel ? 4 : 1);
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
  const result = await pageEntities(`${baseQuery(schema, owner)} AND $key = key(${entityKey})`, 1, 0, "$key:key ASC", { count: false, select: SCAN_SELECT });
  if (!result.entities[0]) throw new Error("Entity is missing, deleted, or expired on Arkiv.");
  return result.entities[0];
}
export function datasetOf(entity: Entity): Dataset {
  const a = unpack(entity), doc = documentOf<{ description: string; ingestionChunkBlocks?: number; resultSource?: Dataset["resultSource"] }>(entity);
  const chunkBlocks = doc.ingestionChunkBlocks ?? 10;
  if (!Number.isInteger(chunkBlocks) || chunkBlocks < 1 || chunkBlocks > 10) throw new Error("Ingestion chunks must contain 1–10 blocks.");
  if (Number(a.chainId) !== 137 || String(a.contract).toLowerCase() !== USDC) throw new Error("Unsupported dataset source.");
  let resultSource: Dataset["resultSource"];
  if (doc.resultSource) {
    assertKey(doc.resultSource.datasetKey);
    if (!Array.isArray(doc.resultSource.filters) || doc.resultSource.filters.length > 20 || !Number.isSafeInteger(doc.resultSource.rows) || doc.resultSource.rows < 0 || !/^\d+$/.test(String(a.startBlock)) || !/^\d+$/.test(String(a.endBlock)) || BigInt(String(a.endBlock)) < BigInt(String(a.startBlock)) || a.continuous === true) throw new Error("Invalid saved dataset scope.");
    resultSource = { ...doc.resultSource, filters: doc.resultSource.filters.map(validateFilters) };
    if (doc.resultSource.scopes !== undefined) {
      const scopes = validateResultScopes(doc.resultSource.scopes);
      if (scopes.some(scope => BigInt(scope.fromBlock) < BigInt(String(a.startBlock)) || BigInt(scope.throughBlock) > BigInt(String(a.endBlock)))) throw new Error("Invalid saved dataset scope.");
      resultSource.scopes = scopes;
    }
  }
  return { ...meta(entity), name: String(a.name), description: String(doc.description ?? ""), chainId: Number(a.chainId), contract: String(a.contract).toLowerCase(), writer: String(a.writer).toLowerCase(), startBlock: String(a.startBlock), endBlock: String(a.endBlock), enabled: a.enabled === true, continuous: a.continuous === true, createdAt: new Date(Number(a.sourceTime) * 1000).toISOString(), chunkBlocks, ...(resultSource ? { resultSource } : {}) };
}
export async function listDatasets(owner?: string) { return (await scanEntities(baseQuery("axis.dataset.v1", owner) + ` AND writer = addr(${writerAddress()})`, 1000)).map(datasetOf); }
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
  if (dataset.resultSource) {
    const scopes = datasetScopes(dataset, dataset.endBlock);
    const reads = new Map<string, Promise<CoverageSummary>>();
    const coverages = await Promise.all(scopes.map(async scope => {
      let read = reads.get(scope.datasetKey);
      if (!read) {
        read = (async () => {
          const source = await getDataset(scope.datasetKey);
          if (source.resultSource) throw new Error("Saved datasets must reference an original source dataset.");
          return coverageSummary(source);
        })();
        reads.set(scope.datasetKey, read);
      }
      return { scope, coverage: await read };
    }));
    const gaps = coverages.flatMap(({ scope, coverage }) => {
      const gaps = [...coverage.gaps];
      if (!coverage.throughBlock || BigInt(scope.fromBlock) < BigInt(coverage.fromBlock) || BigInt(scope.throughBlock) > BigInt(coverage.throughBlock)) gaps.push("The saved dataset's source coverage is unavailable.");
      return gaps;
    });
    const scope = { fromBlock: dataset.startBlock, throughBlock: dataset.endBlock, gaps: [] } as unknown as CoverageSummary;
    const response = gaps.length ? null : await countEntities(filteredQuery(dataset, scope, {}));
    if (response && response.count == null) throw new Error("Arkiv did not return a saved dataset record count.");
    const actualRows = Number(response?.count ?? 0);
    if (!gaps.length && actualRows !== dataset.resultSource.rows) gaps.push("Saved dataset records changed or expired. Run the source query again to save a new dataset.");
    const manifests = [...new Map(coverages.flatMap(({ scope, coverage }) => coverage.manifests.filter(item => BigInt(item.toBlock) >= BigInt(scope.fromBlock) && BigInt(item.fromBlock) <= BigInt(scope.throughBlock))).map(item => [item.key, item])).values()];
    return { complete: gaps.length === 0, fromBlock: dataset.startBlock, throughBlock: dataset.endBlock, requestedThrough: dataset.endBlock, expectedRows: dataset.resultSource.rows, actualRows, gaps, manifests };
  }
  const [manifests, alerts, localAlert] = await Promise.all([
    listCoverage(dataset.key),
    scanEntities(`${baseQuery("axis.coverage_alert.v1", writerAddress())} AND datasetKey = key(${dataset.key})`, 100),
    readState<{ reason: string } | null>("source-alert-" + dataset.key, null),
  ]);
  let next = BigInt(dataset.startBlock), expectedRows = 0;
  const gaps: string[] = [];
  if (alerts.length || localAlert) gaps.push("A source consistency failure invalidated this dataset. Pause it and publish a new verified dataset revision.");
  for (const item of manifests) {
    if (BigInt(item.fromBlock) !== next) { gaps.push(`Non-contiguous or overlapping coverage at ${item.fromBlock}; expected ${next}.`); break; }
    next = BigInt(item.toBlock) + 1n; expectedRows += item.rows;
  }
  const throughBlock = next > BigInt(dataset.startBlock) ? (next - 1n).toString() : null;
  const requestedThrough = dataset.endBlock === "0" ? (throughBlock ?? dataset.startBlock) : dataset.endBlock;
  const count = throughBlock ? await countEntities(`${transferBase(dataset.key)} AND blockNumber >= u64(${dataset.startBlock}) AND blockNumber <= u64(${throughBlock})`) : null;
  const actualRows = Number(count?.count ?? 0);
  if (actualRows !== expectedRows) gaps.push(`Coverage expects ${expectedRows} transfers but Arkiv has ${actualRows}. Records may be expired or unavailable; reconcile before calculating totals.`);
  return { complete: gaps.length === 0 && throughBlock !== null && BigInt(throughBlock) >= BigInt(requestedThrough), fromBlock: dataset.startBlock, throughBlock, requestedThrough, expectedRows, actualRows, gaps, manifests };
}
export const transferBase = (datasetKey: string) => { assertKey(datasetKey); return `${baseQuery("axis.transfer.v1", writerAddress())} AND datasetKey = key(${datasetKey})`; };
export function transferOf(entity: Entity): Transfer {
  const a = unpack(entity);
  return { entityKey: String(entity.key), ...(a.datasetKey ? { datasetKey: String(a.datasetKey) } : {}), sourceId: String(a.sourceId), chainId: Number(a.chainId), contract: String(a.contract).toLowerCase(), blockNumber: String(a.blockNumber), blockHash: String(a.blockHash), timestamp: String(a.sourceTime), txHash: String(a.txHash), txIndex: a.txIndex === undefined ? null : Number(a.txIndex), logIndex: Number(a.logIndex), sender: String(a.sender).toLowerCase(), recipient: String(a.recipient).toLowerCase(), amountRaw: String(a.amountRaw), amount: String(a.amount), decimals: Number(a.decimals), contentHash: String(a.contentHash) };
}
export function filteredQuery(dataset: Dataset, coverage: CoverageSummary, filters: Filters) {
  if (!coverage.throughBlock) throw new Error("No verified coverage yet. Run ingestion first.");
  if (coverage.gaps.length) throw new Error(coverage.gaps.join(" "));
  const predicates = datasetScopes(dataset, coverage.throughBlock).map(scope => {
    const clauses = [transferBase(scope.datasetKey), `blockNumber >= u64(${scope.fromBlock})`, `blockNumber <= u64(${scope.throughBlock})`];
    for (const savedFilters of [...scope.filters, filters]) {
      const filters = validateFilters(savedFilters);
      for (const [field, operator] of [["fromTime", ">="], ["toTime", "<="]] as const) if (filters[field]) clauses.push(`sourceTime ${operator} u64(${filters[field]})`);
      for (const field of ["sender", "recipient"] as const) if (filters[field]) clauses.push(`${field} = addr(${filters[field]})`);
      if (filters.conditions) clauses.push(...compileAttributeConditions(filters.conditions, transferAttributeFields));
      if (filters.predicate) clauses.push(`(${filters.predicate})`);
    }
    return clauses.join(" AND ");
  });
  return predicates.length === 1 ? predicates[0] : predicates.map(predicate => `(${predicate})`).join(" OR ");
}
export function executeCombinedQuery(input: unknown, mode: "page", offset?: number, limit?: number, direction?: "asc" | "desc"): Promise<PageQueryResult>;
export function executeCombinedQuery(input: unknown, mode: "analytics", offset?: number, limit?: number, direction?: "asc" | "desc"): Promise<AnalyticsQueryResult>;
export function executeCombinedQuery(input: unknown, mode: "export", offset?: number, limit?: number, direction?: "asc" | "desc"): Promise<ExportQueryResult>;
export function executeCombinedQuery(input: unknown, mode: QueryMode, offset?: number, limit?: number, direction?: "asc" | "desc"): Promise<QueryResult>;
export async function executeCombinedQuery(input: unknown, mode: QueryMode, offset = 0, limit = 25, direction: "asc" | "desc" = "desc"): Promise<QueryResult> {
  const queries = validateQuerySources(input);
  const sources = await Promise.all(queries.map(async query => {
    const dataset = await getDataset(query.datasetKey), coverage = await coverageSummary(dataset);
    return { ...query, dataset, coverage };
  }));
  // Each OR branch retains its own trusted owner, dataset, verified range and filters.
  const predicate = sources.map(source => `(${filteredQuery(source.dataset, source.coverage, source.filters)})`).join(" OR ");
  const fromBlock = sources.map(source => source.dataset.startBlock).reduce((a, b) => BigInt(a) < BigInt(b) ? a : b);
  const toBlock = sources.map(source => source.coverage.throughBlock!).reduce((a, b) => BigInt(a) > BigInt(b) ? a : b);
  const recordKeys = [...new Set(sources.flatMap(source => datasetScopes(source.dataset, source.coverage.throughBlock!).map(scope => scope.datasetKey)))];
  if (sources.reduce((total, source) => total + datasetScopes(source.dataset, source.coverage.throughBlock!).length, 0) > 20) throw new Error("Select datasets with at most 20 underlying source scopes.");
  const recordDatasets = await Promise.all(recordKeys.map(async key => { const dataset = sources.find(source => source.dataset.key === key)?.dataset ?? await getDataset(key); return { key, name: dataset.name }; }));
  const coverage: CoverageSummary = { complete: sources.every(source => source.coverage.complete), fromBlock, throughBlock: toBlock, requestedThrough: toBlock, expectedRows: 0, actualRows: 0, gaps: [], manifests: [...new Map(sources.flatMap(source => source.coverage.manifests).map(item => [item.key, item])).values()] };
  const common = { dataset: sources[0].dataset, sources, recordDatasets, coverage, scope: { fromBlock, toBlock, fromTime: null, toTime: null }, fetchedAt: new Date().toISOString() };
  if (mode === "page") {
    const order = `blockNumber:u64 ${direction === "asc" ? "ASC" : "DESC"}`;
    const response = await pageEntities(predicate, limit, offset, order, { select: TRANSFER_SELECT });
    if (response.count == null) throw new Error("Arkiv did not return a combined record count.");
    return { ...common, coverage: { ...coverage, expectedRows: Number(response.count), actualRows: Number(response.count) }, entities: response.entities.map(transferOf), total: response.count.toString(), blockNumber: response.blockNumber.toString(), executedQuery: `${predicate} ORDER BY ${order}`, offset, limit };
  }
  const rows = (await scanEntities(predicate, MAX_SCOPE_ROWS, { parallel: true, select: TRANSFER_SELECT })).map(transferOf), expected = await countEntities(predicate);
  if (expected.count == null || BigInt(rows.length) !== expected.count) throw new Error("Datasets changed during the scan. Execute the query again to obtain a consistent result.");
  return { ...common, coverage: { ...coverage, expectedRows: rows.length, actualRows: rows.length }, analytics: aggregateTransfers(rows), ...(mode === "export" ? { entities: rows } : {}), executedQuery: `${predicate} ORDER BY $key:key ASC`, blockNumber: expected.blockNumber.toString(), scannedRows: rows.length };
}
export function executeQuery(datasetKey: string, input: unknown, mode: "page", offset?: number, limit?: number): Promise<PageQueryResult>;
export function executeQuery(datasetKey: string, input: unknown, mode: "analytics", offset?: number, limit?: number): Promise<AnalyticsQueryResult>;
export function executeQuery(datasetKey: string, input: unknown, mode: "export", offset?: number, limit?: number): Promise<ExportQueryResult>;
export function executeQuery(datasetKey: string, input: unknown, mode: QueryMode, offset?: number, limit?: number): Promise<QueryResult>;
export async function executeQuery(datasetKey: string, input: unknown, mode: QueryMode, offset = 0, limit = 25): Promise<QueryResult> {
  const filters = validateFilters(input), dataset = await getDataset(datasetKey), coverage = await coverageSummary(dataset);
  const predicate = filteredQuery(dataset, coverage, filters);
  const order = `blockNumber:u64 ${filters.order === "asc" ? "ASC" : "DESC"}`;
  const scope = { fromBlock: dataset.startBlock, toBlock: coverage.throughBlock!, fromTime: filters.fromTime ?? null, toTime: filters.toTime ?? null };
  const recordDatasets = dataset.resultSource?.scopes ? await Promise.all([...new Set(dataset.resultSource.scopes.map(scope => scope.datasetKey))].map(async key => ({ key, name: (await getDataset(key)).name }))) : undefined;
  if (mode === "page") {
    const response = await pageEntities(predicate, limit, offset, order, { select: TRANSFER_SELECT });
    return { dataset, coverage, scope, ...(recordDatasets ? { recordDatasets } : {}), entities: response.entities.map(transferOf), total: response.count?.toString() ?? null, blockNumber: response.blockNumber.toString(), executedQuery: `${predicate} ORDER BY ${order}`, offset, limit, fetchedAt: new Date().toISOString() };
  }
  const rows = (await scanEntities(predicate, MAX_SCOPE_ROWS, { parallel: true, select: TRANSFER_SELECT })).map(transferOf);
  const expected = await countEntities(predicate);
  if (expected.count === undefined || BigInt(rows.length) !== expected.count) throw new Error("Dataset changed during the scan. Refresh to obtain a consistent result.");
  return { dataset, coverage, scope, ...(recordDatasets ? { recordDatasets } : {}), analytics: aggregateTransfers(rows), ...(mode === "export" ? { entities: rows } : {}), executedQuery: `${predicate} ORDER BY $key:key ASC`, blockNumber: expected.blockNumber.toString(), scannedRows: rows.length, fetchedAt: new Date().toISOString() };
}
export async function listDashboards(): Promise<SavedDocument[]> { return (await scanEntities(`${baseQuery("axis.dashboard.v1")} AND published = true`, 1000)).map(dashboardOf).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
export function dashboardOf(entity: Entity): SavedDocument { const a = unpack(entity); return { ...meta(entity), title: String(a.title), document: validateDashboard(documentOf(entity)), updatedAt: new Date(Number(a.sourceTime) * 1000).toISOString() }; }
export async function getDashboard(entityKey: string) { return dashboardOf(await getEntity("axis.dashboard.v1", entityKey)); }
export async function savedQueries(owner: string): Promise<SavedQuery[]> { return (await scanEntities(baseQuery("axis.saved_query.v1", owner), 500)).map(entity => ({ ...meta(entity), title: String(unpack(entity).title), query: documentOf(entity) })); }
export async function publishedJobs(): Promise<Job[]> { return (await scanEntities(baseQuery("axis.ingestion_status.v1", writerAddress()), 1000)).map(entity => ({ ...documentOf<Job>(entity), statusKey: String(entity.key) })); }
