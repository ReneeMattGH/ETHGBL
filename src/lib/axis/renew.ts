import { ExpirationTime } from "@arkiv-network/sdk";
import type { Hex } from "viem";
import { arkivReader, writerAddress } from "./runtime";
import { serialWorkerWriter as workerWriter } from "./signing";
import { baseQuery, pageEntities } from "./store";
import { BULK_IMPORT_SCHEMA, BULK_RECORD_SCHEMA } from "./bulk/publication-model";
export async function renewWorkerEntities() {
  const timing = await arkivReader().getBlockTiming(), threshold = timing.currentBlock + 7n * 43200n;
  const schemas = ["axis.transfer.v1", "axis.block.v1", "axis.contract.v1", "axis.coverage.v1", "axis.coverage_alert.v1", "axis.daily_metric.v1", BULK_IMPORT_SCHEMA, BULK_RECORD_SCHEMA];
  const hashes: Hex[] = [];
  let renewed = 0;
  for (const schema of schemas) {
    let cursor: string | undefined;
    for (;;) {
      const result = await pageEntities(`${baseQuery(schema, writerAddress())} AND $expiresAt < u64(${threshold})${cursor ? ` AND $key > key(${cursor})` : ""}`, 100);
      const pending = result.entities.map(entity => String(entity.key));
      for (let index = 0; index < pending.length; index += 20) { const extended = await workerWriter().executeBatch({ extensions: pending.slice(index, index + 20).map(entityKey => ({ entityKey: entityKey as Hex, expiration: ExpirationTime.fromDays(30) })) }); hashes.push(extended.txHash); renewed += Math.min(20, pending.length - index); }
      if (pending.length < 100) break;
      const next = pending.at(-1)!; if (next === cursor) throw new Error("Retention pagination did not advance."); cursor = next;
    }
  }
  return { renewed, transactionHashes: hashes };
}
