import { createHash } from "node:crypto";
import { isAddress } from "viem";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type RpcBlock = { number: string; hash: string; parentHash: string; timestamp: string; transactions: RpcTransaction[]; [key: string]: Json | RpcTransaction[] };
export type RpcTransaction = { hash: string; blockHash: string; blockNumber: string; transactionIndex: string; from: string; to: string | null; [key: string]: Json };
export type RpcLog = { address: string; blockNumber: string; blockHash: string; transactionHash: string; transactionIndex: string; logIndex: string; topics: string[]; data: string; removed?: boolean; [key: string]: Json | undefined };
export type RpcReceipt = { transactionHash: string; blockHash: string; blockNumber: string; transactionIndex: string; logs: RpcLog[]; [key: string]: Json | RpcLog[] };
export type TokenSelection = { address: string; stablecoin: boolean; expectedDecimals?: number };
export type BulkConfig = { version: 1; chainId: 137; fromBlock: string; toBlock: string; tokens: TokenSelection[]; concurrency: number };
export type TokenMetadata = { address: string; decimals: number; symbol: string; name: string; stablecoin: boolean; codeHash: string; observedAtBlock: string };
export const STAGED_TABLES = ["polygon-blocks", "polygon-transactions", "polygon-logs", "polygon-contracts", "token-metadata", "token-transfers"] as const;
export type StagedTable = typeof STAGED_TABLES[number];
export type StageRecord = { version: 1; tableId: StagedTable; sourceId: string; blockNumber: string; blockHash: string; timestamp: string; contract: string | null; txHash: string | null; payload: Json; contentHash: string };
export type StagePart = { file: string; sha256: string; bytes: number; blockNumber: string; blockHash: string; parentHash: string; counts: Partial<Record<StagedTable, number>>; records: number };
export type StageManifest = { version: 1; config: BulkConfig; configHash: string; status: "extracting" | "complete"; createdAt: string; updatedAt: string; sourceHost: string; tokens: TokenMetadata[]; parts: StagePart[] };

// Stable hashes do not depend on RPC JSON object key order. Hex and large integers stay strings.
export function canonical(value: unknown): string {
  if (value === undefined) throw new Error("Undefined values cannot be staged.");
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && (!Number.isFinite(value) || !Number.isSafeInteger(value))) throw new Error("Unsafe numeric value in source data.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}
export const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export const documentHash = (value: unknown) => digest(canonical(value));
export const quantity = (value: string) => {
  if (!/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) throw new Error("Invalid RPC quantity.");
  return BigInt(value).toString();
};
export const rpcQuantity = (value: string | bigint) => `0x${BigInt(value).toString(16)}`;
export function blockNumber(value: unknown): string {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,19})$/.test(value) || BigInt(value) > 18446744073709551615n) throw new Error("Block numbers must be canonical unsigned 64-bit decimal strings.");
  return value;
}
export function validateBulkConfig(input: unknown): BulkConfig {
  if (!input || typeof input !== "object") throw new Error("Invalid bulk configuration.");
  const c = input as BulkConfig;
  if (c.version !== 1 || c.chainId !== 137) throw new Error("Bulk extraction supports Polygon mainnet (137), config version 1.");
  const fromBlock = blockNumber(c.fromBlock), toBlock = blockNumber(c.toBlock);
  if (BigInt(toBlock) < BigInt(fromBlock) || BigInt(toBlock) - BigInt(fromBlock) >= 1_000_000n) throw new Error("Select an inclusive range of 1–1,000,000 blocks per run.");
  if (!Number.isInteger(c.concurrency) || c.concurrency < 1 || c.concurrency > 8) throw new Error("Read concurrency must be 1–8.");
  if (!Array.isArray(c.tokens) || c.tokens.length > 100) throw new Error("Select at most 100 token contracts.");
  const tokens = c.tokens.map(token => {
    if (!token || !isAddress(token.address) || typeof token.stablecoin !== "boolean") throw new Error("Each token needs a valid address and explicit stablecoin classification.");
    if (token.expectedDecimals !== undefined && (!Number.isInteger(token.expectedDecimals) || token.expectedDecimals < 0 || token.expectedDecimals > 255)) throw new Error("Invalid expected token decimals.");
    return { address: token.address.toLowerCase(), stablecoin: token.stablecoin, ...(token.expectedDecimals === undefined ? {} : { expectedDecimals: token.expectedDecimals }) };
  }).sort((a, b) => a.address.localeCompare(b.address));
  if (new Set(tokens.map(t => t.address)).size !== tokens.length) throw new Error("Duplicate token selections.");
  return { version: 1, chainId: 137, fromBlock, toBlock, tokens, concurrency: c.concurrency };
}
export function record(input: Omit<StageRecord, "version" | "contentHash">): StageRecord {
  const body = { version: 1 as const, ...input };
  return { ...body, contentHash: documentHash(body) };
}
export async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, action: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length); let cursor = 0;
  // Settle every in-flight read before propagating a failure; a rejected sibling never leaks into another run.
  const settled = await Promise.allSettled(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; results[index] = await action(items[index], index); }
  }));
  const failure = settled.find(result => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return results;
}
