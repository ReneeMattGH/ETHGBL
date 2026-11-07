import type { DashboardDocument, QueryDefinition, SavedDocument } from "./model";
import { validateQuerySources } from "./core";
import { assertKey, dashboardOf, executeCombinedQuery, executeQuery, getDataset, getEntity, unpack } from "./store";
import { datasetQuerySchema } from "./dataset-schema";

export async function publicReport(entityKey: string): Promise<SavedDocument> {
  assertKey(entityKey);
  const entity = await getEntity("axis.dashboard.v1", entityKey);
  if (unpack(entity).published !== true) throw new Error("This dashboard is not published.");
  return dashboardOf(entity);
}
export function reportDatasetKeys(document: DashboardDocument): string[] {
  const queries = document.query ? [document.query] : document.widgets.map(widget => widget.query);
  return [...new Set(queries.flatMap(query => (query.queries ?? [query]).map(source => source.datasetKey.toLowerCase())))];
}
export function reportQuery(document: DashboardDocument, input: unknown) {
  const value = input as QueryDefinition & { mode?: string; offset?: number; limit?: number };
  if (!value || typeof value !== "object") throw new Error("Invalid dashboard query.");
  const queries = validateQuerySources(value.queries ?? [value]);
  const allowed = reportDatasetKeys(document);
  if (queries.some(query => !allowed.includes(query.datasetKey.toLowerCase()))) throw new Error("This dataset is not part of the published dashboard.");
  if (!Number.isInteger(value.offset ?? 0) || (value.offset ?? 0) < 0 || (value.offset ?? 0) > 1000000 || !Number.isInteger(value.limit ?? 25) || (value.limit ?? 25) < 1 || (value.limit ?? 25) > 100) throw new Error("Invalid pagination.");
  if (value.mode !== "analytics" && value.mode !== "page") throw new Error("Only dashboard data reads are available.");
  return { queries, mode: value.mode as "analytics" | "page", offset: value.offset ?? 0, limit: value.limit ?? 25, order: value.filters?.order === "asc" ? "asc" as const : "desc" as const };
}
export async function readReportData(dashboard: SavedDocument, input: unknown) {
  const query = reportQuery(dashboard.document, input);
  return query.queries.length > 1
    ? executeCombinedQuery(query.queries, query.mode, query.offset, query.limit, query.order)
    : executeQuery(query.queries[0].datasetKey, query.queries[0].filters, query.mode, query.offset, query.limit);
}
export async function reportDatasets(dashboard: SavedDocument) {
  return Promise.all(reportDatasetKeys(dashboard.document).map(getDataset));
}
export async function reportSchema(dashboard: SavedDocument, datasetKey: string) {
  assertKey(datasetKey);
  if (!reportDatasetKeys(dashboard.document).includes(datasetKey.toLowerCase())) throw new Error("This dataset is not part of the published dashboard.");
  return datasetQuerySchema(await getDataset(datasetKey));
}
