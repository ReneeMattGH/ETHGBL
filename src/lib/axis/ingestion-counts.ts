import { writerAddress } from "./runtime";
import { queryArkiv } from "./arkiv-read";
import { baseQuery, literal } from "./store";
import { catalogTable } from "./catalog";
import { BULK_RECORD_SCHEMA, BULK_TABLES, bulkPhysicalTables, type BulkTableId } from "./bulk/publication-model";

export type IngestionCounts = {
  rows: string;
  blocks: string;
  tables: { id: string; name: string; rows: string }[];
  fetchedAt: string;
};

async function readCounts(): Promise<IngestionCounts> {
  const owner = writerAddress();
  // Physical records only; curated aliases and ingestion control entities are excluded.
  const requests = (Object.keys(BULK_TABLES) as BulkTableId[])
    .filter(id => { const physical = bulkPhysicalTables(id); return physical.length === 1 && physical[0] === id; })
    .map(id => ({ id, predicate: `${baseQuery(BULK_RECORD_SCHEMA, owner)} AND tableId = ${literal(id)}` }));
  requests.push(
    { id: "polygon-blocks", predicate: baseQuery("axis.block.v1", owner) },
    { id: "token-transfers", predicate: baseQuery("axis.transfer.v1", owner) },
    { id: "token-metadata", predicate: baseQuery("axis.contract.v1", owner) },
  );
  const counts: bigint[] = new Array(requests.length); let cursor = 0;
  const settled = await Promise.allSettled(Array.from({ length: 4 }, async () => {
    while (cursor < requests.length) {
      const index = cursor++, request = requests[index];
      const response = await queryArkiv({ query: request.predicate, select: {}, count: true });
      if (response.count === undefined || response.count < 0n) throw new Error("Arkiv did not return a valid stored-row count.");
      counts[index] = response.count;
    }
  }));
  const failed = settled.find(result => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  const totals = new Map<string, bigint>();
  requests.forEach(({ id }, index) => totals.set(id, (totals.get(id) ?? 0n) + counts[index]));
  const tables = [...totals].filter(([, count]) => count > 0n)
    .sort(([a, left], [b, right]) => left === right ? a.localeCompare(b) : left > right ? -1 : 1)
    .map(([id, count]) => ({ id, name: catalogTable(id)?.name ?? id, rows: count.toString() }));
  return { rows: [...totals.values()].reduce((sum, count) => sum + count, 0n).toString(), blocks: (totals.get("polygon-blocks") ?? 0n).toString(), tables, fetchedAt: new Date().toISOString() };
}

let cached: { expires: number; promise: Promise<IngestionCounts> } | undefined;
export function ingestionCounts() {
  if (!cached || Date.now() > cached.expires) {
    const entry = { expires: Infinity, promise: readCounts() };
    cached = entry;
    void entry.promise.then(() => { entry.expires = Date.now() + 5000; }, () => { if (cached === entry) cached = undefined; });
  }
  return cached.promise;
}
