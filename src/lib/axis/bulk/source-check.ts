import { join } from "node:path";
import { canonical, quantity, rpcQuantity, type RpcBlock, type RpcLog } from "./model";
import { assertSource, decodeTransfers } from "./source";
import { atomicJson, readPart, runLock, verifyStage } from "./staging";
import type { RpcSource } from "./rpc";

function logFields(log: RpcLog) {
  return { address: log.address.toLowerCase(), blockNumber: quantity(log.blockNumber), blockHash: log.blockHash.toLowerCase(), txHash: log.transactionHash.toLowerCase(), transactionIndex: quantity(log.transactionIndex), logIndex: quantity(log.logIndex), topics: log.topics.map(topic => topic.toLowerCase()), data: log.data.toLowerCase(), removed: Boolean(log.removed) };
}
export async function crossCheckSource(directory: string, source: RpcSource) {
  return runLock(directory, async () => {
    const verified = await verifyStage(directory);
    await assertSource(source, verified.manifest.config);
    let logsChecked = 0, transfersChecked = 0;
    for (const part of verified.manifest.parts) {
      const rows = await readPart(directory, part), raw = rows.filter(row => row.tableId === "polygon-logs");
      const observed = await source.read<RpcLog[]>("eth_getLogs", [{ fromBlock: rpcQuantity(part.blockNumber), toBlock: rpcQuantity(part.blockNumber) }]);
      if (!Array.isArray(observed) || observed.length !== raw.length) throw new Error("Separate eth_getLogs count differs from receipt-derived raw logs.");
      const actual = observed.map(log => canonical(logFields(log))).sort(), expected = raw.map(row => canonical(logFields(row.payload as unknown as RpcLog))).sort();
      if (canonical(actual) !== canonical(expected)) throw new Error("Separate eth_getLogs content differs from receipt-derived raw logs.");
      const header = await source.read<RpcBlock>("eth_getBlockByNumber", [rpcQuantity(part.blockNumber), false]);
      if (header?.hash?.toLowerCase() !== part.blockHash) throw new Error("Source block changed during cross-check.");
      const decoded = decodeTransfers(observed, verified.manifest.tokens, header).sort((a, b) => a.sourceId.localeCompare(b.sourceId));
      const stored = rows.filter(row => row.tableId === "token-transfers").sort((a, b) => a.sourceId.localeCompare(b.sourceId));
      if (canonical(decoded) !== canonical(stored)) throw new Error("Separate eth_getLogs transfer decoding differs from staged records.");
      logsChecked += observed.length; transfersChecked += decoded.length;
    }
    const report = { version: 1, at: new Date().toISOString(), passed: true, fromBlock: verified.fromBlock, throughBlock: verified.throughBlock, blocks: verified.blocks, logsChecked, transfersChecked, rpcCalls: source.calls(), sourceConfigHash: verified.manifest.configHash, verification: "Different RPC methods on the same configured provider; not an independent provider or receipt-proof check.", publication: "local-only" };
    await atomicJson(join(directory, "source-check.json"), report); return report;
  });
}
