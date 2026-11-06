import { ExpirationTime } from "@arkiv-network/sdk";
import type { Hex } from "viem";
import { arkivReader, workerWriter, writerAddress } from "./runtime";
import { baseQuery, scanEntities } from "./store";
export async function renewWorkerEntities() {
  const timing = await arkivReader().getBlockTiming(), threshold = timing.currentBlock + 7n * 43200n;
  const schemas = ["axis.transfer.v1", "axis.block.v1", "axis.contract.v1", "axis.coverage.v1", "axis.coverage_alert.v1", "axis.daily_metric.v1"];
  const pending: string[] = [];
  for (const schema of schemas) for (const entity of await scanEntities(`${baseQuery(schema, writerAddress())} AND $expiresAt < u64(${threshold})`)) if (entity.key) pending.push(entity.key);
  const hashes: Hex[] = [];
  for (let index = 0; index < pending.length; index += 20) { const result = await workerWriter().executeBatch({ extensions: pending.slice(index, index + 20).map(entityKey => ({ entityKey: entityKey as Hex, expiration: ExpirationTime.fromDays(30) })) }); hashes.push(result.txHash); }
  return { renewed: pending.length, transactionHashes: hashes };
}
