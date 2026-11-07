import { decodeEventLog, parseAbiItem, keccak256, stringToHex, formatUnits, isAddress } from "viem";
import type { Log } from "viem";
import { validateVisualization } from "./chart-config";
import { validateAttributeConditions } from "./query-filters";
import { transferAttributeFields } from "./schemas";
import { CHART_KINDS, DECIMALS, SOURCE_CHAIN, USDC, type Transfer, type Analytics, type Filters, type DashboardDocument, type QuerySourceDefinition } from "./model";

export const TRANSFER_EVENT = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
export class SourceConsistencyError extends Error { constructor(message: string) { super(message); this.name = "SourceConsistencyError"; } }
export const nowSeconds = () => BigInt(Math.floor(Date.now() / 1000));
export const hashDocument = (value: unknown) => keccak256(stringToHex(JSON.stringify(value)));
export const sourceIdentity = (chainId: number, hash: string, index: number) => `${chainId}:${hash.toLowerCase()}:${index}`;
export function normalizeTransfer(log: Log, timestamp: bigint): Transfer {
  if (log.removed || log.blockNumber === null || !log.blockHash || !log.transactionHash || log.logIndex === null) throw new Error("Source log is removed or lacks mined metadata.");
  if (log.address.toLowerCase() !== USDC) throw new Error("Unexpected token contract.");
  const decoded = decodeEventLog({ abi: [TRANSFER_EVENT], data: log.data, topics: log.topics, strict: true });
  const { from, to, value } = decoded.args;
  const record = {
    sourceId: sourceIdentity(SOURCE_CHAIN, log.transactionHash, log.logIndex), chainId: SOURCE_CHAIN,
    contract: USDC, blockNumber: log.blockNumber.toString(), blockHash: log.blockHash.toLowerCase(),
    timestamp: timestamp.toString(), txHash: log.transactionHash.toLowerCase(), txIndex: log.transactionIndex ?? null,
    logIndex: log.logIndex, sender: from.toLowerCase(), recipient: to.toLowerCase(), amountRaw: value.toString(),
    amount: formatUnits(value, DECIMALS), decimals: DECIMALS,
  };
  return { ...record, contentHash: hashDocument(record) };
}
export function validateBlockRange(from: string, to: string, max = 1000): [bigint, bigint] {
  if (!/^\d+$/.test(from) || !/^\d+$/.test(to)) throw new Error("Block boundaries must be nonnegative integers.");
  const start = BigInt(from), end = BigInt(to);
  if (end < start || end - start + 1n > BigInt(max)) throw new Error(`Choose an inclusive range of 1–${max} blocks.`);
  return [start, end];
}
export function validateFilters(input: unknown): Filters {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid filters.");
  const source = input as Record<string, unknown>, result: Filters = {};
  if (source.conditions !== undefined) {
    const conditions = validateAttributeConditions(source.conditions, transferAttributeFields);
    if (conditions.length) result.conditions = conditions;
  }
  for (const field of ["sender", "recipient"] as const) {
    if (source[field]) { if (typeof source[field] !== "string" || !isAddress(source[field])) throw new Error(`Invalid ${field} address.`); result[field] = source[field].toLowerCase(); }
  }
  // Legacy saved queries may still contain block limits. Ignore them so every
  // query uses all verified dataset records, subject to wallet and time filters.
  for (const field of ["fromTime", "toTime"] as const) {
    if (source[field] !== undefined && source[field] !== "") { if (typeof source[field] !== "string" || !/^\d{1,20}$/.test(source[field])) throw new Error(`Invalid ${field}.`); result[field] = source[field]; }
  }
  if (result.fromTime && result.toTime && BigInt(result.fromTime) > BigInt(result.toTime)) throw new Error("Range starts after it ends.");
  if (source.predicate) {
    if (typeof source.predicate !== "string" || source.predicate.length > 1000 || /\bORDER\s+BY\b|;|--|\/\*/i.test(source.predicate)) throw new Error("Use a predicate of at most 1000 characters; set sorting separately.");
    // Keep the scope AND-ed to one balanced expression, including escaped string literals.
    const stripped = source.predicate.replace(/'(?:[^']|'')*'/g, "''");
    let depth = 0;
    for (const char of stripped) { if (char === "(") depth++; if (char === ")" && --depth < 0) throw new Error("Unbalanced predicate."); }
    if (depth !== 0 || stripped.replace(/''/g, "").includes("'")) throw new Error("Unbalanced predicate.");
    result.predicate = source.predicate;
  }
  result.order = source.order === "asc" ? "asc" : "desc";
  return result;
}
export function validateQuerySources(input: unknown): QuerySourceDefinition[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 20) throw new Error("Select between 1 and 20 datasets.");
  const seen = new Set<string>();
  return input.map(item => {
    if (!item || typeof item !== "object" || typeof item.datasetKey !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(item.datasetKey)) throw new Error("Invalid query dataset.");
    const datasetKey = item.datasetKey.toLowerCase();
    if (seen.has(datasetKey)) throw new Error("A dataset can only be selected once.");
    seen.add(datasetKey);
    return { datasetKey, filters: validateFilters(item.filters ?? {}) };
  });
}
export function aggregateTransfers(rows: Transfer[]): Analytics {
  const senders = new Set<string>(), recipients = new Set<string>();
  const series = new Map<string, { count: number; amount: bigint }>();
  const bySender = new Map<string, { count: number; amount: bigint }>(), byRecipient = new Map<string, { count: number; amount: bigint }>();
  const byBlock = new Map<string, { timestamp: string; count: number; amount: bigint }>();
  const composition = new Map<string, { timestamp: string; buckets: { count: number; amount: bigint }[] }>();
  const buckets = [{ bucket: "Zero", min: 0n, max: 0n }, { bucket: "Below 1 USDC", min: 1n, max: 999999n }, { bucket: "1–10 USDC", min: 1000000n, max: 9999999n }, { bucket: "10–100 USDC", min: 10000000n, max: 99999999n }, { bucket: "100–1,000 USDC", min: 100000000n, max: 999999999n }, { bucket: "1,000+ USDC", min: 1000000000n, max: null }].map(bucket => ({ ...bucket, count: 0, amount: 0n }));
  let amount = 0n, mintCount = 0, burnCount = 0, zeroValueCount = 0;
  const zero = "0x" + "0".repeat(40);
  for (const row of rows) {
    const value = BigInt(row.amountRaw); amount += value;
    const block = byBlock.get(row.blockNumber) ?? { timestamp: row.timestamp, count: 0, amount: 0n }; block.count++; block.amount += value; byBlock.set(row.blockNumber, block);
    const bucket = buckets.find(bucket => value >= bucket.min && (bucket.max === null || value <= bucket.max))!; bucket.count++; bucket.amount += value;
    const split = composition.get(row.blockNumber) ?? { timestamp: row.timestamp, buckets: buckets.map(() => ({ count: 0, amount: 0n })) };
    const cell = split.buckets[buckets.indexOf(bucket)]; cell.count++; cell.amount += value; composition.set(row.blockNumber, split);
    senders.add(row.sender); recipients.add(row.recipient);
    if (row.sender === zero) mintCount++; if (row.recipient === zero) burnCount++; if (value === 0n) zeroValueCount++;
    const day = new Date(Number(row.timestamp) * 1000).toISOString().slice(0, 10);
    for (const [map, id] of [[series, day], [bySender, row.sender], [byRecipient, row.recipient]] as const) {
      const current = map.get(id) ?? { count: 0, amount: 0n }; current.count++; current.amount += value; map.set(id, current);
    }
  }
  const top = (map: typeof bySender) => [...map].sort((a, b) => a[1].amount === b[1].amount ? a[0].localeCompare(b[0]) : a[1].amount > b[1].amount ? -1 : 1).slice(0, 20).map(([address, v]) => ({ address, transfers: v.count, amountRaw: v.amount.toString(), amount: formatUnits(v.amount, DECIMALS) }));
  const blocks = rows.map(row => BigInt(row.blockNumber)), times = rows.map(row => BigInt(row.timestamp));
  const bounds = (values: bigint[]) => values.length ? [values.reduce((a, b) => a < b ? a : b).toString(), values.reduce((a, b) => a > b ? a : b).toString()] : [null, null];
  const [fromBlock, toBlock] = bounds(blocks), [fromTime, toTime] = bounds(times);
  const amounts = rows.map(row => BigInt(row.amountRaw)).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const middle = Math.floor(amounts.length / 2);
  const medianAmount = !amounts.length ? null : amounts.length % 2 ? formatUnits(amounts[middle], DECIMALS) : formatUnits((amounts[middle - 1] + amounts[middle]) * 5n, DECIMALS + 1);
  // Mean is rounded half-up to one token base unit; quantiles never use floating-point arithmetic.
  const averageRaw = rows.length ? (amount * 2n + BigInt(rows.length)) / (2n * BigInt(rows.length)) : 0n;
  return { transfers: rows.length, amountRaw: amount.toString(), amount: formatUnits(amount, DECIMALS), uniqueSenders: senders.size, uniqueRecipients: recipients.size, uniqueWallets: new Set([...senders, ...recipients]).size,
    averageAmount: rows.length ? formatUnits(averageRaw, DECIMALS) : null, medianAmount, p90Amount: amounts.length ? formatUnits(amounts[Math.ceil(amounts.length * 9 / 10) - 1], DECIMALS) : null, largestAmount: amounts.length ? formatUnits(amounts.at(-1)!, DECIMALS) : null,
    blockSeries: [...byBlock].sort(([a], [b]) => BigInt(a) < BigInt(b) ? -1 : 1).map(([blockNumber, value]) => ({ blockNumber, timestamp: value.timestamp, transfers: value.count, amountRaw: value.amount.toString(), amount: formatUnits(value.amount, DECIMALS) })),
    distribution: buckets.map(bucket => ({ bucket: bucket.bucket, transfers: bucket.count, amountRaw: bucket.amount.toString(), amount: formatUnits(bucket.amount, DECIMALS) })),
    blockComposition: [...composition].sort(([a], [b]) => BigInt(a) < BigInt(b) ? -1 : 1).map(([blockNumber, value]) => ({ blockNumber, timestamp: value.timestamp, buckets: value.buckets.map((cell, index) => ({ bucket: buckets[index].bucket, transfers: cell.count, amountRaw: cell.amount.toString(), amount: formatUnits(cell.amount, DECIMALS) })) })),
    mintCount, burnCount, zeroValueCount, series: [...series].sort(([a], [b]) => a.localeCompare(b)).map(([bucket, v]) => ({ bucket, transfers: v.count, amountRaw: v.amount.toString(), amount: formatUnits(v.amount, DECIMALS) })), topSenders: top(bySender), topRecipients: top(byRecipient), fromBlock, toBlock, fromTime, toTime };
}
export function validateDashboard(value: unknown): DashboardDocument {
  if (!value || typeof value !== "object") throw new Error("Invalid dashboard document.");
  const doc = value as DashboardDocument;
  if (doc.version !== 1 || typeof doc.title !== "string" || !doc.title.trim() || doc.title.length > 80 || typeof doc.description !== "string" || doc.description.length > 2000 || !Array.isArray(doc.widgets) || doc.widgets.length < 1 || doc.widgets.length > 12 || ![0, 30000, 60000, 300000].includes(doc.refreshMs)) throw new Error("Invalid dashboard configuration.");
  if (doc.query) { validateQuerySources(doc.query.queries ?? [doc.query]); validateFilters(doc.query.filters); }
  for (const widget of doc.widgets) {
    if (widget?.description !== undefined && (typeof widget.description !== "string" || widget.description.length > 240)) throw new Error("Visual explanations must be under 240 characters.");
    if (!widget || typeof widget.id !== "string" || typeof widget.title !== "string" || widget.title.length > 100 || !["metric", ...CHART_KINDS, "table"].includes(widget.kind) || !["transfers", "amount", "uniqueSenders", "uniqueRecipients", "uniqueWallets", "averageAmount", "medianAmount", "p90Amount", "largestAmount"].includes(widget.metric) || !["time", "block", "sender", "recipient", "distribution"].includes(widget.grouping) || ![1, 2].includes(widget.width) || !/^0x[0-9a-fA-F]{64}$/.test(widget.query?.datasetKey)) throw new Error("Invalid dashboard widget.");
    validateFilters(widget.query.filters);
    if (widget.query.queries !== undefined) validateQuerySources(widget.query.queries);
    validateVisualization(widget);
  }
  return doc;
}
