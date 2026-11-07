import type { CoverageSummary, Dataset } from "./model";
import type { DatasetQuerySchema } from "./query-filters";
import { transferAttributeFields } from "./schemas";
import { coverageSummary, filteredQuery, pageEntities, transferBase } from "./store";

export async function datasetQuerySchema(dataset: Dataset, coverage?: CoverageSummary): Promise<DatasetQuerySchema> {
  const sample = await pageEntities(dataset.resultSource ? filteredQuery(dataset, coverage ?? await coverageSummary(dataset), {}) : transferBase(dataset.key), 1, 0, "$key:key ASC", { count: false, select: { key: true, attributeSchema: true } });
  const fields = Object.entries(sample.entities[0]?.attributeSchema ?? {}).map(([name, field]) => ({ name, type: field.type, indexed: field.indexed ?? false }));
  return { datasetKey: dataset.key, observed: sample.entities.length > 0, fields, filterFields: sample.entities.length ? fields : transferAttributeFields };
}
