export const USDC = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359" as const;
export const SOURCE_CHAIN = 137;
export const DECIMALS = 6;
export const MAX_SCOPE_ROWS = 20_000;
export const SCHEMA_VERSION = 1;
export type EntityMeta = { key: string; owner: string; creator: string; expiresAt: string };
export type Dataset = EntityMeta & {
  name: string; description: string; chainId: number; contract: string; writer: string;
  startBlock: string; endBlock: string; enabled: boolean; continuous: boolean; createdAt: string; chunkBlocks?: number;
};
export type Transfer = {
  sourceId: string; chainId: number; contract: string; blockNumber: string; blockHash: string;
  timestamp: string; txHash: string; txIndex: number | null; logIndex: number; sender: string;
  recipient: string; amountRaw: string; amount: string; decimals: number; contentHash: string;
  entityKey?: string;
};
export type Coverage = EntityMeta & {
  datasetKey: string; fromBlock: string; toBlock: string; rows: number; contentHash: string;
  blockHashes: Record<string, string>; transactionHashes: string[]; verifiedAt: string;
};
export type CoverageSummary = {
  complete: boolean; fromBlock: string; throughBlock: string | null; requestedThrough: string;
  expectedRows: number; actualRows: number; gaps: string[]; manifests: Coverage[];
};
export type Filters = { sender?: string; recipient?: string; fromBlock?: string; toBlock?: string;
  fromTime?: string; toTime?: string; predicate?: string; lookbackBlocks?: string; order?: "asc" | "desc" };
export type Analytics = {
  transfers: number; amountRaw: string; amount: string; uniqueSenders: number; uniqueRecipients: number;
  uniqueWallets: number; mintCount: number; burnCount: number; zeroValueCount: number;
  series: { bucket: string; transfers: number; amountRaw: string; amount: string }[];
  topSenders: { address: string; transfers: number; amountRaw: string; amount: string }[];
  topRecipients: { address: string; transfers: number; amountRaw: string; amount: string }[];
  fromBlock: string | null; toBlock: string | null; fromTime: string | null; toTime: string | null;
  averageAmount: string | null; medianAmount: string | null; p90Amount: string | null; largestAmount: string | null;
  blockSeries: { blockNumber: string; timestamp: string; transfers: number; amountRaw: string; amount: string }[];
  distribution: { bucket: string; transfers: number; amountRaw: string; amount: string }[];
};
export type QueryDefinition = { datasetKey: string; filters: Filters };
export type AxisWidget = { id: string; title: string; kind: "metric" | "line" | "bar" | "table";
  metric: "transfers" | "amount" | "uniqueSenders" | "uniqueRecipients" | "uniqueWallets" | "averageAmount" | "medianAmount" | "p90Amount" | "largestAmount";
  grouping: "time" | "block" | "sender" | "recipient" | "distribution"; width: 1 | 2; query: QueryDefinition };
export type DashboardDocument = { version: 1; title: string; description: string; widgets: AxisWidget[]; refreshMs: number; preset?: "usdc-activity-v1" };
export const METRIC_LABELS: Record<AxisWidget["metric"], string> = { transfers: "Transfers", amount: "Gross transferred USDC", uniqueSenders: "Unique senders", uniqueRecipients: "Unique recipients", uniqueWallets: "Active wallets (union)", averageAmount: "Mean transfer (USDC)", medianAmount: "Median transfer (USDC)", p90Amount: "P90 transfer (USDC)", largestAmount: "Largest transfer (USDC)" };
export type SavedDocument = EntityMeta & { title: string; document: DashboardDocument; updatedAt: string };
export type SavedQuery = EntityMeta & { title: string; query: QueryDefinition };
export type Job = { id: string; datasetKey: string; owner: string; fromBlock: string; toBlock: string;
  stage: "queued" | "extracting" | "publishing" | "verifying" | "complete" | "failed";
  createdAt: string; updatedAt: string; processed: number; total: number; duplicates: number;
  txHashes: string[]; error: string | null; statusKey?: string };
export type PlatformConfig = { writer: string; polygonConfigured: boolean; arkivConfigured: boolean;
  worker: { running: boolean; heartbeat: string | null }; finalizedBlock: string | null; error: string | null };
