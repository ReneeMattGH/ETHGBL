import { CATALOG_GROUPS, catalogTable, type CatalogView } from "./catalog";
import { POLYGON_ACTIVITY_DATASET_KEY, newestTableImport } from "./catalog-sources";
import { baseQuery, coverageSummary, countEntities, executeQuery, getDataset, scanEntities, unpack } from "./store";
import { writerAddress } from "./runtime";
import { BULK_TABLES, expectedTableCount, type BulkTableId } from "./bulk/publication-model";
import { bulkPreviewValues, bulkTableQuery, listPublishedImports } from "./bulk/published-store";
import type { CatalogInsightChart, CatalogInsights } from "./catalog-insight-model";
import { MAX_SCOPE_ROWS, type Analytics } from "./model";

type Values = Record<string, string | boolean>;
const primaryTable: Record<string, string> = {
  "token-registry": "token-metadata", "token-transfers": "token-transfers", stablecoins: "stablecoin-transfers",
  "chain-rpc": "rpc-registry", "address-labels": "address-labels", signatures: "function-signatures", "wallet-ratings": "wallet-ratings", prediction: "prediction-trades",
  dex: "dex-trades", lending: "lending-actions", polygon: "polygon-blocks",
  quickswap: "quickswap-swaps", "uniswap-v3": "uniswap_v3-swaps", "aave-v3": "lending-actions",
  polymarket: "prediction-trades",
};
const metric = (label: string, value: number | string) => ({ label, value: typeof value === "number" ? value.toLocaleString("en-US") : value });
const unique = (rows: Values[], ...names: string[]) => new Set(rows.flatMap(row => names.map(name => String(row[name] ?? "").toLowerCase())).filter(value => value && value !== "null" && value !== "undefined")).size;
function grouped(rows: Values[], field: string) {
  const values = new Map<string, number>();
  for (const row of rows) { const value = String(row[field] ?? "Unknown"); values.set(value, (values.get(value) ?? 0) + 1); }
  return [...values].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label, count]) => ({ label, value: String(count) }));
}
function timeline(rows: Values[]) {
  const groups = new Map<string, number>();
  for (const row of rows) {
    const seconds = String(row.timestamp ?? row.sourceTime ?? "");
    if (!/^\d+$/.test(seconds) || !Number.isFinite(Number(seconds)) || Number(seconds) > 8640000000000) continue;
    const label = new Date(Math.floor(Number(seconds) / 3600) * 3600000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
    groups.set(label, (groups.get(label) ?? 0) + 1);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([label, count]) => ({ label, value: String(count) }));
}
const chart = (title: string, unit: string, points: CatalogInsightChart["points"], kind: CatalogInsightChart["kind"] = "treemap", decimals = 0): CatalogInsightChart => ({ title, unit, points, kind: kind === "line" ? "stacked-area" : kind === "bar" ? "treemap" : kind === "horizontal" ? "ranked" : kind, decimals });

export function relationshipChart(title: string, unit: string, rows: Values[], source: string, target: string, dimensions: { source: string; target: string }, kind: "flow" | "matrix" = "flow"): CatalogInsightChart {
  const category = (row: Values, field: string) => row[field] === undefined || row[field] === "" ? "Unknown" : String(row[field]);
  const categories = (field: string) => {
    const labels = grouped(rows.map(row => ({ value: category(row, field) })), "value").map(item => item.label);
    let remainder = "Other categories";
    while (labels.includes(remainder)) remainder += " (combined)";
    return labels.length > 12 ? [...labels.slice(0, 11), remainder] : labels;
  };
  const sources = categories(source), targets = categories(target), values = sources.map(() => targets.map(() => 0n));
  for (const row of rows) {
    const sourceIndex = sources.indexOf(category(row, source)), targetIndex = targets.indexOf(category(row, target));
    values[sourceIndex < 0 ? sources.length - 1 : sourceIndex][targetIndex < 0 ? targets.length - 1 : targetIndex]++;
  }
  return { title, unit, decimals: 0, kind, dimensions, series: targets.map((label, index) => ({ id: `relationship-${index}`, label })), points: sources.map((label, index) => ({ label, value: values[index].reduce((sum, value) => sum + value, 0n).toString(), values: values[index].map(String) })) };
}

function signatureArity(signature: string) {
  const start = signature.indexOf("("), end = signature.lastIndexOf(")");
  if (start < 0 || end <= start) return "Unknown";
  const args = signature.slice(start + 1, end).trim();
  if (!args) return "0 parameters";
  let depth = 0, count = 1;
  for (const char of args) { if (char === "(" || char === "[") depth++; else if (char === ")" || char === "]") depth--; else if (char === "," && depth === 0) count++; }
  return `${count} parameter${count === 1 ? "" : "s"}`;
}

export function compositionTimeline(title: string, unit: string, rows: Values[], category: string, kind: "stacked-area" | "heatmap" = "stacked-area"): CatalogInsightChart {
  const categories = grouped(rows, category).slice(0, 10).map(item => item.label).sort();
  const others = grouped(rows, category).length > 10;
  if (others) categories.push("Other categories");
  const groups = new Map<string, bigint[]>();
  for (const row of rows) {
    const seconds = String(row.timestamp ?? row.sourceTime ?? "");
    if (!/^\d+$/.test(seconds) || Number(seconds) > 8640000000000) continue;
    const label = new Date(Math.floor(Number(seconds) / 60) * 60000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
    const categoryValue = String(row[category] ?? "Unknown"), index = categories.indexOf(categoryValue);
    const values = groups.get(label) ?? categories.map(() => 0n);
    values[index < 0 ? categories.length - 1 : index]++;
    groups.set(label, values);
  }
  return { title, unit, decimals: 0, kind, series: categories.map((label, index) => ({ id: `category-${index}`, label })), points: [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([label, values]) => ({ label, value: values.reduce((sum, value) => sum + value, 0n).toString(), values: values.map(String) })) };
}
export function transferComposition(title: string, analytics: Analytics, amount: boolean): CatalogInsightChart {
  const base = { title, unit: amount ? "USDC" : "Transfers", decimals: amount ? 6 : 0, kind: "stacked-area" as const };
  if (!analytics.blockComposition?.length) return { ...base, points: analytics.series.map(point => ({ label: point.bucket, value: amount ? point.amountRaw : String(point.transfers) })) };
  const blocks = new Map(analytics.blockSeries.map(block => [block.blockNumber, block]));
  return { ...base, series: analytics.distribution.map((bucket, index) => ({ id: `size-${index}`, label: bucket.bucket })), points: analytics.blockComposition.map(block => {
    const timestamp = blocks.get(block.blockNumber)?.timestamp;
    const label = `Block ${block.blockNumber}${timestamp ? ` · ${new Date(Number(timestamp) * 1000).toISOString().slice(0, 19).replace("T", " ")} UTC` : ""}`;
    const values = block.buckets.map(bucket => amount ? bucket.amountRaw : String(bucket.transfers));
    return { label, value: values.reduce((sum, value) => sum + BigInt(value), 0n).toString(), values };
  }) };
}

// The two transfer collections share a read of the platform feed, never a user's dataset.
let transferRead: { at: number; pending: boolean; promise: ReturnType<typeof executeQuery> } | undefined;
function platformAnalytics() {
  if (!transferRead || !transferRead.pending && Date.now() - transferRead.at > 20000) {
    const promise = executeQuery(POLYGON_ACTIVITY_DATASET_KEY, {}, "analytics");
    transferRead = { at: Date.now(), pending: true, promise };
    void promise.then(() => { if (transferRead?.promise === promise) { transferRead.pending = false; transferRead.at = Date.now(); } }, () => { if (transferRead?.promise === promise) transferRead = undefined; });
  }
  return transferRead.promise;
}

export async function catalogCollectionInsights(view: string, entryId: string, requestedImport?: string | null): Promise<CatalogInsights> {
  if (!Object.hasOwn(CATALOG_GROUPS, view)) throw new Error("Unknown catalog category.");
  const entry = CATALOG_GROUPS[view as CatalogView].find(item => item.id === entryId);
  if (!entry) throw new Error("Unknown catalog collection.");
  const unavailable: CatalogInsights = { entryId, status: "not-indexed", metrics: [], charts: [] };
  const tableId = primaryTable[entryId];
  if (!tableId) return unavailable;
  if (["token-transfers", "stablecoins"].includes(entryId) && !requestedImport) {
    const result = await platformAnalytics();
    if (!result.analytics) throw new Error("Platform activity analytics are unavailable.");
    const analytics = result.analytics;
    const stablecoins = entryId === "stablecoins";
    return { entryId, status: "available",
      metrics: stablecoins ? [metric("USDC transferred", analytics.amount), metric("USDC transfers", analytics.transfers), metric("Active wallets", analytics.uniqueWallets), metric("Mint events", analytics.mintCount)] : [metric("Transfers", analytics.transfers), metric("Transferred USDC", analytics.amount), metric("Unique senders", analytics.uniqueSenders), metric("Unique recipients", analytics.uniqueRecipients)],
      charts: stablecoins ? [
        transferComposition("USDC transfer volume", analytics, true),
        chart("Stablecoin transfer sizes", "Transfers", analytics.distribution.map(point => ({ label: point.bucket, value: String(point.transfers) })), "donut"),
      ] : [
        transferComposition("Token transfer activity", analytics, false),
        chart("Top sending wallets", "USDC", [...analytics.topSenders.map(point => ({ label: point.address, value: point.amountRaw })), ...(BigInt(analytics.amountRaw ?? "0") > analytics.topSenders.reduce((sum, point) => sum + BigInt(point.amountRaw), 0n) ? [{ label: "Other sending wallets", value: (BigInt(analytics.amountRaw) - analytics.topSenders.reduce((sum, point) => sum + BigInt(point.amountRaw), 0n)).toString() }] : [])], "ranked", 6),
      ],
      source: { name: "Polygon live activity", table: stablecoins ? "stablecoins.transfers" : "tokens.transfers", fromBlock: result.scope.fromBlock, throughBlock: result.scope.toBlock ?? undefined, fetchedAt: result.fetchedAt, executedQuery: result.executedQuery },
    };
  }
  const imported = Object.hasOwn(BULK_TABLES, tableId) ? newestTableImport(await listPublishedImports(), tableId as BulkTableId, requestedImport) : undefined;
  let rows: Values[], source: NonNullable<CatalogInsights["source"]>;
  if (tableId === "polygon-blocks" && !requestedImport) {
    const dataset = await getDataset(POLYGON_ACTIVITY_DATASET_KEY), coverage = await coverageSummary(dataset);
    if (!coverage.throughBlock || coverage.gaps.length) throw new Error("Polygon block coverage is unavailable or needs reconciliation.");
    const predicate = `${baseQuery("axis.block.v1", writerAddress())} AND datasetKey = key(${dataset.key}) AND blockNumber >= u64(${dataset.startBlock}) AND blockNumber <= u64(${coverage.throughBlock})`;
    const entities = await scanEntities(predicate, MAX_SCOPE_ROWS, { parallel: true }), count = await countEntities(predicate);
    if (count.count === undefined || BigInt(entities.length) !== count.count) throw new Error("Polygon block records changed during the scan. Refresh to retry.");
    rows = entities.map(unpack);
    source = { name: "Polygon live activity", table: "polygon.blocks", fromBlock: dataset.startBlock, throughBlock: coverage.throughBlock, fetchedAt: new Date().toISOString(), executedQuery: `${predicate} ORDER BY $key:key ASC` };
  } else if (imported) {
    const predicate = bulkTableQuery(tableId as BulkTableId, imported);
    const entities = await scanEntities(predicate, MAX_SCOPE_ROWS, { parallel: true });
    if (entities.length !== expectedTableCount(imported.document, tableId as BulkTableId)) throw new Error("Published coverage differs from stored records. Refresh after reconciliation.");
    rows = entities.map(entity => bulkPreviewValues(entity).values);
    source = { name: imported.name, table: catalogTable(tableId)?.name ?? tableId, fromBlock: imported.document.fromBlock, throughBlock: imported.document.throughBlock!, fetchedAt: new Date().toISOString(), executedQuery: `${predicate} ORDER BY $key:key ASC` };
  } else if (tableId === "token-metadata" && !requestedImport) {
    const predicate = baseQuery("axis.contract.v1", writerAddress());
    const entities = await scanEntities(predicate, MAX_SCOPE_ROWS, { parallel: true }), count = await countEntities(predicate);
    if (count.count === undefined || BigInt(entities.length) !== count.count) throw new Error("Token metadata changed during the scan. Refresh to retry.");
    rows = entities.map(unpack);
    source = { name: "Polygon token registry", table: "tokens.metadata", fetchedAt: new Date().toISOString(), executedQuery: `${predicate} ORDER BY $key:key ASC` };
  } else return unavailable;

  let metrics: CatalogInsights["metrics"], charts: CatalogInsightChart[];
  if (tableId === "token-metadata") {
    metrics = [metric("Token contracts", unique(rows, "contract")), metric("Token symbols", unique(rows, "symbol"))];
    const tokens = rows.map(row => ({ ...row, precision: row.decimals === undefined ? "Unknown" : `${row.decimals} decimals` }));
    charts = [relationshipChart("Token precision map", "Token contracts", tokens, "symbol", "precision", { source: "Token symbol", target: "Token precision" })];
  } else if (tableId === "polygon-blocks") {
    metrics = [metric("Verified blocks", rows.length), metric("Latest verified block", source.throughBlock!)];
    charts = [chart("Imported Polygon blocks", "Blocks", timeline(rows), "line")];
  } else if (tableId === "lending-actions") {
    metrics = [metric("Lending actions", rows.length), metric("Action types", unique(rows, "event")), metric("Reserve assets", unique(rows, "reserve", "collateralAsset", "debtAsset")), metric("Participating wallets", unique(rows, "user", "onBehalfOf", "repayer", "liquidator"))];
    const reserves = rows.map(row => ({ ...row, reserveAsset: row.reserve ?? row.collateralAsset ?? row.debtAsset ?? "Unknown" }));
    charts = [compositionTimeline("Lending activity", "Actions", rows, "event"), relationshipChart("Lending actions by reserve", "Actions", reserves, "event", "reserveAsset", { source: "Action type", target: "Reserve asset" }), compositionTimeline("Actions by type", "Actions", rows, "event", "heatmap")];
  } else if (tableId === "rpc-registry") {
    metrics = [metric("Public RPC endpoints", rows.length), metric("Networks", unique(rows, "chainId")), metric("Source registries", unique(rows, "source"))];
    charts = [relationshipChart("RPC registry coverage", "Endpoints", rows, "source", "status", { source: "Registry source", target: "Reported status" }), relationshipChart("Endpoint coverage by network", "Endpoints", rows, "chainId", "source", { source: "Chain ID", target: "Registry source" }, "matrix")];
  } else if (tableId === "address-labels") {
    metrics = [metric("Labelled addresses", unique(rows, "contract")), metric("Protocols", unique(rows, "protocol")), metric("Contract roles", unique(rows, "role"))];
    charts = [relationshipChart("Protocol & contract role relationships", "Labels", rows, "protocol", "role", { source: "Protocol", target: "Contract role" }), relationshipChart("Protocol role coverage", "Labels", rows, "protocol", "role", { source: "Protocol", target: "Contract role" }, "matrix")];
  } else if (tableId === "function-signatures") {
    metrics = [metric("Function signatures", rows.length), metric("Distinct selectors", unique(rows, "selector")), metric("ABI sources", unique(rows, "source"))];
    charts = [relationshipChart("Signature provenance map", "Signatures", rows, "source", "selector", { source: "ABI source", target: "Function selector" }), relationshipChart("Function parameter complexity", "Signatures", rows.map(row => ({ ...row, arity: signatureArity(String(row.signature ?? "")) })), "arity", "source", { source: "Parameter count", target: "ABI source" }, "matrix")];
  } else if (tableId === "wallet-ratings") {
    metrics = [metric("Rated wallets", unique(rows, "contract")), metric("Scoring models", unique(rows, "model"))];
    charts = [relationshipChart("Wallet scores by model", "Wallets", rows, "score", "model", { source: "Observed score", target: "Scoring model" }, "matrix"), chart("Wallet activity score distribution", "Wallets", grouped(rows, "score"), "ranked")];
  } else if (tableId === "prediction-trades") {
    metrics = [metric("Trade fills", rows.length), metric("Transactions", unique(rows, "txHash")), metric("Makers", unique(rows, "maker")), metric("Takers", unique(rows, "taker"))];
    charts = [compositionTimeline("Prediction-market fills", "Fills", rows, "family"), relationshipChart("Exchange & maker participation", "Fills", rows, "family", "maker", { source: "Exchange", target: "Maker address" })];
  } else if (tableId === "token-transfers" || tableId === "stablecoin-transfers") {
    metrics = [metric("Token transfers", rows.length), metric("Token contracts", unique(rows, "contract")), metric("Active wallets", unique(rows, "sender", "recipient")), metric("Transactions", unique(rows, "txHash"))];
    charts = [compositionTimeline("Imported token activity", "Transfers", rows, "symbol"), relationshipChart("Token & sender participation", "Transfers", rows, "symbol", "sender", { source: "Token", target: "Sender address" })];
  } else {
    metrics = [metric("Trades", rows.length), metric("Protocols", unique(rows, "protocol")), metric("Trading pools", unique(rows, "contract")), metric("Transactions", unique(rows, "txHash"))];
    charts = [compositionTimeline("DEX trade activity", "Trades", rows, "protocol"), relationshipChart("Protocol & pool activity", "Trades", rows, "protocol", "contract", { source: "Protocol", target: "Trading pool" })];
  }
  return { entryId, status: "available", metrics, charts, source };
}
