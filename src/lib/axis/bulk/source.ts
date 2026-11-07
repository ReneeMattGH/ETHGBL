import { decodeAbiParameters, decodeEventLog, formatUnits, keccak256, parseAbiItem } from "viem";
import { mapConcurrent, quantity, record, rpcQuantity, type BulkConfig, type Json, type RpcBlock, type RpcLog, type RpcReceipt, type StageRecord, type TokenMetadata } from "./model";
import { unsupportedMethod, type RpcSource } from "./rpc";

const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const hashPattern = /^0x[0-9a-f]{64}$/i;
const addressPattern = /^0x[0-9a-f]{40}$/i;
export async function assertSource(source: RpcSource, config: BulkConfig) {
  if (quantity(await source.read<string>("eth_chainId", [])) !== "137") throw new Error("Source RPC is not Polygon mainnet (137).");
  const finalized = await source.read<RpcBlock | null>("eth_getBlockByNumber", ["finalized", false]);
  if (!finalized || !hashPattern.test(finalized.hash)) throw new Error("Source did not return a finalized block.");
  if (BigInt(config.toBlock) > BigInt(quantity(finalized.number))) throw new Error("Requested range is beyond the finalized boundary.");
  return quantity(finalized.number);
}
export async function readTokenMetadata(source: RpcSource, config: BulkConfig): Promise<TokenMetadata[]> {
  return mapConcurrent(config.tokens, config.concurrency, async selection => {
    const tag = rpcQuantity(config.fromBlock);
    const call = (data: string) => source.read<`0x${string}`>("eth_call", [{ to: selection.address, data }, tag]);
    const decimals = Number(decodeAbiParameters([{ type: "uint8" }], await call("0x313ce567"))[0]);
    if (selection.expectedDecimals !== undefined && selection.expectedDecimals !== decimals) throw new Error(`Token decimals mismatch for ${selection.address}.`);
    const symbol = decodeAbiParameters([{ type: "string" }], await call("0x95d89b41"))[0];
    const name = decodeAbiParameters([{ type: "string" }], await call("0x06fdde03"))[0];
    const code = await source.read<`0x${string}`>("eth_getCode", [selection.address, tag]);
    if (!/^0x(?:[0-9a-f]{2})+$/i.test(code)) throw new Error(`No deployed bytecode for selected token ${selection.address}.`);
    return { ...selection, decimals, symbol, name, codeHash: keccak256(code), observedAtBlock: config.fromBlock };
  });
}
export function validateBlock(block: RpcBlock, receipts: RpcReceipt[], expected: string, previousHash?: string) {
  if (!block || quantity(block.number) !== expected || !hashPattern.test(block.hash) || !hashPattern.test(block.parentHash) || !Array.isArray(block.transactions)) throw new Error("Invalid block response.");
  quantity(block.timestamp);
  if (previousHash && previousHash.toLowerCase() !== block.parentHash.toLowerCase()) throw new Error("Source continuity changed; start a new verified run.");
  if (!Array.isArray(receipts) || receipts.length !== block.transactions.length) throw new Error("Receipt count differs from source transaction count.");
  const byHash = new Map(receipts.map(receipt => [receipt.transactionHash.toLowerCase(), receipt]));
  if (byHash.size !== receipts.length) throw new Error("Duplicate receipts in source response.");
  const logIds = new Set<string>(), transactionIds = new Set<string>();
  for (const [index, tx] of block.transactions.entries()) {
    const receipt = byHash.get(tx.hash?.toLowerCase());
    if (!hashPattern.test(tx.hash) || transactionIds.has(tx.hash.toLowerCase()) || tx.blockHash?.toLowerCase() !== block.hash.toLowerCase() || quantity(tx.blockNumber) !== expected || quantity(tx.transactionIndex) !== String(index) || !receipt || receipt.blockHash?.toLowerCase() !== block.hash.toLowerCase() || quantity(receipt.blockNumber) !== expected || quantity(receipt.transactionIndex) !== String(index) || !Array.isArray(receipt.logs)) throw new Error("Transaction/receipt identity differs from source block.");
    transactionIds.add(tx.hash.toLowerCase());
    for (const log of receipt.logs) {
      const id = quantity(log.logIndex);
      if (log.removed || !addressPattern.test(log.address) || log.blockHash?.toLowerCase() !== block.hash.toLowerCase() || quantity(log.blockNumber) !== expected || log.transactionHash?.toLowerCase() !== tx.hash.toLowerCase() || quantity(log.transactionIndex) !== String(index) || logIds.has(id) || !Array.isArray(log.topics) || log.topics.some(topic => !hashPattern.test(topic)) || !/^0x(?:[0-9a-f]{2})*$/i.test(log.data)) throw new Error("Removed, duplicate or inconsistent source log.");
      logIds.add(id);
    }
  }
}
export function decodeTransfers(logs: RpcLog[], tokens: TokenMetadata[], block: RpcBlock): StageRecord[] {
  const selected = new Map(tokens.map(token => [token.address.toLowerCase(), token]));
  const result: StageRecord[] = [];
  for (const log of logs) {
    const token = selected.get(log.address.toLowerCase());
    if (!token || log.topics[0]?.toLowerCase() !== "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef") continue;
    // A malformed Transfer from a selected ERC-20 contract must fail the chunk, never disappear silently.
    if (log.topics.length !== 3) throw new Error("Selected ERC-20 emitted an incompatible Transfer layout.");
    const { args } = decodeEventLog({ abi: [transfer], data: log.data as `0x${string}`, topics: log.topics as [`0x${string}`, ...`0x${string}`[]], strict: true });
    result.push(record({ tableId: "token-transfers", sourceId: `137:${log.transactionHash.toLowerCase()}:${quantity(log.logIndex)}`, blockNumber: quantity(block.number), blockHash: block.hash.toLowerCase(), timestamp: quantity(block.timestamp), contract: token.address, txHash: log.transactionHash.toLowerCase(), payload: { sender: args.from.toLowerCase(), recipient: args.to.toLowerCase(), amountRaw: args.value.toString(), amount: formatUnits(args.value, token.decimals), decimals: token.decimals, symbol: token.symbol, stablecoin: token.stablecoin, logIndex: quantity(log.logIndex), abiVersion: "ERC20.Transfer.v1" } }));
  }
  return result;
}
export function blockRecords(block: RpcBlock, receipts: RpcReceipt[], tokens: TokenMetadata[], includeMetadata: boolean): StageRecord[] {
  const common = { blockNumber: quantity(block.number), blockHash: block.hash.toLowerCase(), timestamp: quantity(block.timestamp) };
  const rows: StageRecord[] = [record({ ...common, tableId: "polygon-blocks", sourceId: `137:${block.hash.toLowerCase()}`, contract: null, txHash: null, payload: { ...block, transactions: block.transactions.map(tx => tx.hash.toLowerCase()) } as Json })];
  const receiptMap = new Map(receipts.map(receipt => [receipt.transactionHash.toLowerCase(), receipt]));
  const logs: RpcLog[] = [];
  for (const tx of block.transactions) {
    const receipt = receiptMap.get(tx.hash.toLowerCase())!;
    rows.push(record({ ...common, tableId: "polygon-transactions", sourceId: `137:${tx.hash.toLowerCase()}`, contract: tx.to?.toLowerCase() ?? null, txHash: tx.hash.toLowerCase(), payload: { transaction: tx, receipt: { ...receipt, logs: [] }, logCount: receipt.logs.length } as Json }));
    logs.push(...receipt.logs);
  }
  logs.sort((a, b) => BigInt(a.logIndex) < BigInt(b.logIndex) ? -1 : 1);
  for (const log of logs) rows.push(record({ ...common, tableId: "polygon-logs", sourceId: `137:${log.transactionHash.toLowerCase()}:${quantity(log.logIndex)}`, contract: log.address.toLowerCase(), txHash: log.transactionHash.toLowerCase(), payload: log as Json }));
  rows.push(...decodeTransfers(logs, tokens, block));
  if (includeMetadata) for (const token of tokens) for (const tableId of ["token-metadata", "polygon-contracts"] as const) rows.push(record({ ...common, tableId, sourceId: `137:${token.address}:${common.blockNumber}`, contract: token.address, txHash: null, payload: token as unknown as Json }));
  return rows;
}
export function blockExtractor(source: RpcSource, concurrency: number) {
  let bulkReceipts = true;
  return async (number: string, tokens: TokenMetadata[], includeMetadata: boolean, previousHash?: string) => {
    const block = await source.read<RpcBlock>("eth_getBlockByNumber", [rpcQuantity(number), true]);
    if (!block || !Array.isArray(block.transactions)) throw new Error("Source block is missing.");
    let receipts: RpcReceipt[] | undefined;
    if (bulkReceipts) {
      try { receipts = await source.read<RpcReceipt[]>("eth_getBlockReceipts", [rpcQuantity(number)]); }
      catch (error) { if (!unsupportedMethod(error)) throw error; bulkReceipts = false; }
    }
    if (!receipts) receipts = await mapConcurrent(block.transactions, concurrency, tx => source.read<RpcReceipt>("eth_getTransactionReceipt", [tx.hash]));
    validateBlock(block, receipts, number, previousHash);
    const boundary = await source.read<RpcBlock>("eth_getBlockByNumber", [rpcQuantity(number), false]);
    if (boundary?.hash?.toLowerCase() !== block.hash.toLowerCase()) throw new Error("Source block changed during extraction.");
    return { block, rows: blockRecords(block, receipts, tokens, includeMetadata) };
  };
}
