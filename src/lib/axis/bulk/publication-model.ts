export const BULK_RECORD_SCHEMA = "axis.bulk.record.v1";
export const BULK_IMPORT_SCHEMA = "axis.bulk.import.v1";
export const BULK_TABLES = {
  "polygon-blocks": ["blockNumber", "blockHash", "timestamp"],
  "polygon-transactions": ["blockNumber", "txHash", "from", "to", "status"],
  "polygon-logs": ["blockNumber", "txHash", "contract", "logIndex", "topics", "data"],
  "polygon-contracts": ["contract", "symbol", "decimals", "codeHash"],
  "token-metadata": ["contract", "symbol", "name", "decimals"],
  "token-transfers": ["blockNumber", "txHash", "contract", "symbol", "sender", "recipient", "amount"],
  "stablecoin-transfers": ["blockNumber", "txHash", "contract", "symbol", "sender", "recipient", "amount"],
  "polygon-decoded": ["blockNumber", "txHash", "contract", "event", "details"],
  "dex-trades": ["blockNumber", "txHash", "protocol", "event", "token0", "token1", "details"],
  "lending-actions": ["blockNumber", "txHash", "protocol", "event", "reserve", "amount"],
  "quickswap-pools": ["contract", "family", "token0", "token1", "factory"],
  "quickswap-swaps": ["blockNumber", "txHash", "token0", "token1", "details"],
  "quickswap-liquidity": ["blockNumber", "txHash", "event", "token0", "token1", "details"],
  "uniswap_v3-pools": ["contract", "family", "token0", "token1", "fee", "factory"],
  "uniswap_v3-swaps": ["blockNumber", "txHash", "token0", "token1", "details"],
  "uniswap_v3-liquidity": ["blockNumber", "txHash", "event", "token0", "token1", "details"],
  "aave-supplies": ["blockNumber", "txHash", "reserve", "user", "onBehalfOf", "amount"],
  "aave-withdrawals": ["blockNumber", "txHash", "reserve", "user", "to", "amount"],
  "aave-borrows": ["blockNumber", "txHash", "reserve", "user", "amount", "interestRateMode"],
  "aave-repayments": ["blockNumber", "txHash", "reserve", "user", "repayer", "amount"],
  "aave-liquidations": ["blockNumber", "txHash", "collateralAsset", "debtAsset", "user", "debtToCover"],
  "token-lists": ["contract", "symbol", "name", "decimals", "publisher", "fetchedAt"],
  "chain-registry": ["chainId", "name", "nativeCurrency", "source", "fetchedAt"],
  "rpc-registry": ["chainId", "url", "status", "source", "fetchedAt"],
  "address-labels": ["contract", "protocol", "role", "source", "observedAtBlock"],
  "protocol-addresses": ["contract", "protocol", "role", "source", "observedAtBlock"],
  "function-signatures": ["selector", "signature", "abiHash", "source"],
  "event-signatures": ["topic", "signature", "abiHash", "source"],
  "polygon-signatures": ["contract", "abiHash", "runtimeMatch", "historicalValidity", "source"],
  "wallet-ratings": ["contract", "score", "transactions", "activeBlocks", "model", "fromBlock", "toBlock"],
  "rating-models": ["model", "formula", "selection", "coverage"],
  "aave-reserves": ["contract", "pool", "configuration", "normalizedIncome", "normalizedVariableDebt", "observedAtBlock"],
  "polymarket-markets": ["conditionId", "question", "slug", "fetchedAt", "source"],
  "polymarket-outcome_tokens": ["tokenId", "conditionId", "outcome", "fetchedAt"],
  "polymarket-trade_fills": ["blockNumber", "txHash", "family", "maker", "taker", "details"],
  "polymarket-redemptions": ["blockNumber", "txHash", "redeemer", "conditionId", "payout", "details"],
  "prediction-trades": ["blockNumber", "txHash", "family", "maker", "taker", "details"],
  "polygon-traces": ["blockNumber", "txHash", "path", "type", "from", "to", "value", "error"],
  "polygon-creation-traces": ["blockNumber", "txHash", "path", "type", "from", "to", "error"],
  "polygon-decoded-traces": ["blockNumber", "txHash", "path", "selector", "candidates", "decoderStatus"],
} as const;
export type BulkTableId = keyof typeof BULK_TABLES;
export type PublicationPlan = { version: 1; tables: BulkTableId[]; enriched: boolean };
export function publicationPlan(input: unknown): PublicationPlan {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid publication plan.");
  const plan = input as PublicationPlan;
  if (plan.version !== 1 || typeof plan.enriched !== "boolean" || !Array.isArray(plan.tables) || plan.tables.length < 1 || plan.tables.length > 40 || plan.tables.some(t => typeof t !== "string" || !Object.hasOwn(BULK_TABLES, t)) || Object.keys(plan).some(k => !["version", "tables", "enriched"].includes(k))) throw new Error("Invalid publication plan version, selection or fields.");
  return { version: 1, tables: [...new Set(plan.tables)].sort(), enriched: plan.enriched };
}
export type TableCoverage = { state: "available" | "unavailable"; detail: string };
export type PublishedImportDocument = {
  version: 1; runId: string; sourceFingerprint: string; configHash: string; decoderHash: string;
  tokens: { address: string; symbol: string; decimals: number; stablecoin: boolean }[];
  counts: Record<string, number>; sourceHost: string; committedBlocks: number;
  throughBlock: string | null; fromBlock: string; toBlock: string; recordCount: number;
  sourceScope: string; retainedDays: number;
  tableCoverage?: Partial<Record<BulkTableId, TableCoverage>>;
  enrichmentHash?: string;
  selectedTables?: BulkTableId[];
};
export type PublishedImport = { key: string; name: string; status: string; owner: string; expiresAt: string; document: PublishedImportDocument };
export function bulkPhysicalTables(table: BulkTableId): string[] {
  if (table === "prediction-trades") return ["polymarket-trade_fills"];
  if (table === "stablecoin-transfers") return ["token-transfers"];
  if (table === "dex-trades") return ["quickswap-swaps", "uniswap_v3-swaps"];
  if (table === "lending-actions") return ["aave-supplies", "aave-withdrawals", "aave-borrows", "aave-repayments", "aave-liquidations"];
  if (table === "polygon-decoded") return ["token-transfers", "quickswap-swaps", "quickswap-liquidity", "uniswap_v3-swaps", "uniswap_v3-liquidity", "aave-supplies", "aave-withdrawals", "aave-borrows", "aave-repayments", "aave-liquidations"];
  return [table];
}
const LEGACY_BULK_TABLES = new Set(Object.keys(BULK_TABLES).slice(0, 21));
export function bulkTableAvailable(document: PublishedImportDocument, table: string): boolean {
  return Object.hasOwn(BULK_TABLES, table) && (document.tableCoverage ? document.tableCoverage[table as BulkTableId]?.state === "available" : LEGACY_BULK_TABLES.has(table));
}
export function expectedTableCount(document: PublishedImportDocument, table: BulkTableId) {
  if (table === "stablecoin-transfers") return document.counts["stablecoin-transfers"] ?? 0;
  return bulkPhysicalTables(table).reduce((sum, physical) => sum + (document.counts[physical] ?? 0), 0);
}
