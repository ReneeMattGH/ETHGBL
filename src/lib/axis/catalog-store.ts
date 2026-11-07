import { catalogTable } from "./catalog";
import { baseQuery, pageEntities, getDataset, coverageSummary, filteredQuery, unpack } from "./store";
import { writerAddress } from "./runtime";

export async function catalogPreview(tableId: string, datasetKey: string | null, offset = 0) {
  const table = catalogTable(tableId);
  if (!table?.preview || !table.schema) throw new Error("This catalog table is not indexed yet.");
  if (!Number.isInteger(offset) || offset < 0 || offset > 1000000) throw new Error("Invalid preview offset.");
  let query = baseQuery(table.schema, writerAddress());
  let scope: { datasetKey: string; name: string; fromBlock: string; throughBlock: string; rows: number } | null = null;
  if (table.datasetScoped) {
    if (!datasetKey) throw new Error("Select an imported dataset to preview this table.");
    const dataset = await getDataset(datasetKey), coverage = await coverageSummary(dataset);
    if (!coverage.throughBlock) throw new Error("This dataset has no verified records yet.");
    if (coverage.gaps.length) throw new Error(coverage.gaps.join(" "));
    scope = { datasetKey: dataset.key, name: dataset.name, fromBlock: coverage.fromBlock, throughBlock: coverage.throughBlock, rows: coverage.actualRows };
    if (dataset.resultSource) {
      if (table.schema !== "axis.transfer.v1") throw new Error("Saved result datasets contain transfers only.");
      query = filteredQuery(dataset, coverage, {});
    } else query += ` AND datasetKey = key(${dataset.key}) AND blockNumber >= u64(${scope.fromBlock}) AND blockNumber <= u64(${scope.throughBlock})`;
  }
  query += table.datasetScoped ? " ORDER BY blockNumber:u64 DESC" : " ORDER BY $key:key ASC";
  const result = await pageEntities(query.replace(/ ORDER BY.*$/, ""), 10, offset, table.datasetScoped ? "blockNumber:u64 DESC" : "$key:key ASC");
  if (result.count === undefined || result.count === null) throw new Error("Arkiv did not return a record count for this preview.");
  return { tableId, scope, rows: result.entities.map(entity => ({ key: String(entity.key), values: unpack(entity) })), fields: Object.entries(result.entities[0]?.attributeSchema ?? {}).map(([name, field]) => ({ name, type: field.type, indexed: field.indexed ?? false })), total: result.count.toString(), offset, limit: 10, executedQuery: query, blockNumber: result.blockNumber.toString(), fetchedAt: new Date().toISOString() };
}
