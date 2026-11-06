import { createPublicClient, http, type Hex } from "viem";
import { polygon } from "viem/chains";
import { USDC } from "./model";
import { TRANSFER_EVENT, normalizeTransfer, validateBlockRange, SourceConsistencyError } from "./core";
import { retryRead } from "./runtime";

export function polygonReader() {
  const endpoint = process.env.POLYGON_RPC_URL?.trim();
  if (!endpoint) throw new Error("POLYGON_RPC_URL is not configured.");
  const url = new URL(endpoint);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("POLYGON_RPC_URL must be an HTTP(S) endpoint.");
  return createPublicClient({ chain: polygon, transport: http(endpoint, { timeout: 20000, retryCount: 0 }) });
}
export async function finalizedBlock() {
  const client = polygonReader();
  const id = await retryRead(() => client.getChainId());
  if (id !== 137) throw new Error("Source RPC must be Polygon PoS Mainnet (chain 137).");
  const block = await retryRead(() => client.getBlock({ blockTag: "finalized" }));
  if (block.number === null) throw new Error("Source RPC did not return a finalized block.");
  return block;
}
export async function extractRange(from: string, to: string) {
  const [start, end] = validateBlockRange(from, to, 1000), client = polygonReader();
  const finalized = await finalizedBlock();
  if (end > finalized.number!) throw new Error("Requested range is beyond the Polygon finalized boundary.");
  const decimals = await retryRead(() => client.readContract({ address: USDC, abi: [{ type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }], functionName: "decimals", blockNumber: start }));
  if (decimals !== 6) throw new Error("Native USDC decimal metadata does not match the decoder.");
  const blocks: { number: string; hash: string; timestamp: string }[] = [];
  for (let number = start; number <= end; number++) {
    const block = await retryRead(() => client.getBlock({ blockNumber: number }));
    if (!block.hash || block.number !== number || (blocks.length && block.parentHash.toLowerCase() !== blocks.at(-1)!.hash.toLowerCase())) throw new SourceConsistencyError("Source block continuity failed.");
    blocks.push({ number: number.toString(), hash: block.hash.toLowerCase(), timestamp: block.timestamp.toString() });
  }
  const getLogs = async (a: bigint, b: bigint): Promise<Awaited<ReturnType<typeof client.getLogs>>> => {
    try { return await retryRead(() => client.getLogs({ address: USDC, event: TRANSFER_EVENT, fromBlock: a, toBlock: b, strict: true })); }
    catch (error) { if (a === b || !/block range|too many (?:results|logs)|response (?:size|too large)|query returned more|range.*limit|log response size/i.test(error instanceof Error ? error.message : String(error))) throw error; const middle = (a + b) / 2n; return [...await getLogs(a, middle), ...await getLogs(middle + 1n, b)]; }
  };
  const logs = await getLogs(start, end);
  if (logs.length > 5000) throw new Error("This chunk exceeds 5000 events. Use a smaller block range.");
  const blockMap = new Map(blocks.map(block => [block.number, block]));
  const rows = logs.map(log => {
    const block = blockMap.get(String(log.blockNumber));
    if (!block || log.blockHash?.toLowerCase() !== block.hash) throw new SourceConsistencyError("Log block hash differs from source metadata.");
    return normalizeTransfer(log, BigInt(block.timestamp));
  }).sort((a, b) => Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)) || a.logIndex - b.logIndex);
  if (new Set(rows.map(row => row.sourceId)).size !== rows.length) throw new Error("Source RPC returned duplicate logs.");
  const boundary = await retryRead(() => client.getBlock({ blockNumber: end }));
  if (boundary.hash?.toLowerCase() !== blocks.at(-1)!.hash) throw new SourceConsistencyError("Source boundary changed during extraction.");
  return { rows, blocks, rpcHost: new URL(process.env.POLYGON_RPC_URL!).hostname, finalized: finalized.number!.toString() };
}
export async function verifyBlockHashes(hashes: Record<string, string>) {
  const client = polygonReader();
  for (const [number, hash] of Object.entries(hashes)) {
    const block = await retryRead(() => client.getBlock({ blockNumber: BigInt(number) }));
    if (block.hash?.toLowerCase() !== hash.toLowerCase()) throw new SourceConsistencyError(`Source block ${number} changed. Dataset reconciliation is required.`);
  }
}
export const toHexKey = (value: string) => value as Hex;
