import { runQuery, type QueryRequest } from "@arkiv-network/sdk/query";
import { arkivReader, retryRead } from "./runtime";
import { createReadCoordinator } from "./read-coordinator";

const reads = createReadCoordinator();
const clientIds = new WeakMap<object, number>();
let nextId = 0;

export function queryArkiv(request: QueryRequest) {
  const client = arkivReader();
  if (!clientIds.has(client)) clientIds.set(client, ++nextId);
  const selection = Object.fromEntries(Object.entries(request.select).sort(([a], [b]) => a.localeCompare(b)));
  const key = JSON.stringify([clientIds.get(client), request.query, selection, request.limit ?? 100, request.offset ?? 0, Boolean(request.count)]);
  return reads.run(key, () => retryRead(() => runQuery(client, request)));
}
