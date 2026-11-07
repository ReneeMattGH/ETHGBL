import { encodeAbiParameters, encodeEventTopics, parseAbiItem } from "viem";
import { rpcQuantity, type BulkConfig, type RpcBlock, type RpcLog, type RpcReceipt, type RpcTransaction } from "./model";
import { RpcFailure, type RpcSource } from "./rpc";

export const tokenA = "0x" + "11".repeat(20), tokenB = "0x" + "22".repeat(20);
export const sender = "0x" + "33".repeat(20), recipient = "0x" + "44".repeat(20);
export const hash = (number: number) => "0x" + number.toString(16).padStart(64, "0");
export const maxUint256 = (2n ** 256n - 1n).toString();
export const config: BulkConfig = { version: 1, chainId: 137, fromBlock: "10", toBlock: "11", concurrency: 2, tokens: [{ address: tokenA, stablecoin: true, expectedDecimals: 6 }, { address: tokenB, stablecoin: false, expectedDecimals: 18 }] };
export function fixture(number: number) {
  const tx: RpcTransaction = { hash: hash(100 + number), blockHash: hash(number), blockNumber: rpcQuantity(BigInt(number)), transactionIndex: "0x0", from: sender, to: recipient, value: "0x0", input: "0x" };
  const block: RpcBlock = { number: tx.blockNumber, hash: tx.blockHash, parentHash: hash(number - 1), timestamp: rpcQuantity(1_700_000_000n + BigInt(number)), transactions: [tx] };
  const logs: RpcLog[] = [tokenA, tokenB].map((address, index) => ({ address, blockHash: block.hash, blockNumber: block.number, transactionHash: tx.hash, transactionIndex: "0x0", logIndex: rpcQuantity(BigInt(index)), topics: [...encodeEventTopics({ abi: [parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)")], eventName: "Transfer", args: { from: sender as `0x${string}`, to: recipient as `0x${string}` } })] as string[], data: encodeAbiParameters([{ type: "uint256" }], [index === 0 ? BigInt(maxUint256) : 1000000000000000001n]), removed: false }));
  const receipt: RpcReceipt = { transactionHash: tx.hash, blockHash: block.hash, blockNumber: block.number, transactionIndex: "0x0", status: "0x1", logs };
  return { block, receipt, logs };
}
export function fixtureSource(options: { failBlock?: number; receiptsUnsupported?: boolean; changedCheckpoint?: boolean } = {}) {
  const calls: { method: string; params: unknown[] }[] = [];
  const source: RpcSource = {
    host: "fixture.invalid", calls: () => calls.length,
    read: async <T>(method: string, params: unknown[]): Promise<T> => {
      calls.push({ method, params });
      let result: unknown;
      if (method === "eth_chainId") result = "0x89";
      else if (method === "eth_getBlockByNumber") {
        const number = params[0] === "finalized" ? 100 : Number(BigInt(String(params[0])));
        if (number === options.failBlock) throw new Error("Injected extraction interruption");
        result = fixture(number).block;
        if (options.changedCheckpoint && number === 11) result = { ...(result as RpcBlock), hash: hash(999) };
      } else if (method === "eth_getBlockReceipts") {
        if (options.receiptsUnsupported) throw new RpcFailure("Method not found", -32601);
        result = [fixture(Number(BigInt(String(params[0])))).receipt];
      } else if (method === "eth_getTransactionReceipt") result = fixture(Number(BigInt(String(params[0]))) - 100).receipt;
      else if (method === "eth_call") {
        const call = params[0] as { to: string; data: string };
        if (call.data === "0x313ce567") result = encodeAbiParameters([{ type: "uint8" }], [call.to === tokenA ? 6 : 18]);
        else result = encodeAbiParameters([{ type: "string" }], [call.data === "0x95d89b41" ? "FIXTURE" : "Fixture token"]);
      } else if (method === "eth_getCode") result = "0x6000";
      else throw new Error(`Unexpected test RPC ${method}`);
      return structuredClone(result) as T;
    },
  };
  return { source, calls };
}
