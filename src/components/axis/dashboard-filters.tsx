"use client";

import * as React from "react";
import { Plus, RotateCcw, X } from "lucide-react";
import type { Dataset, Filters, QueryDefinition } from "@/lib/axis/model";
import { validateFilters } from "@/lib/axis/core";
import { filtersForSchema, type DatasetQuerySchema } from "@/lib/axis/query-filters";
import { POLYGON_ACTIVITY_DATASET_KEY } from "@/lib/axis/catalog-sources";
import { DatasetQueryFilters } from "./dataset-query-filters";
import { DatasetSelect, Notice, useApi } from "./shared";

export type FilterValidity = { query: QueryDefinition | null; error: string | null; waiting: boolean };
function SourceFilters({ datasetKey, filters, datasets, editable, onDataset, onFilters, onSchema }: {
  datasetKey: string; filters: Filters; datasets: Dataset[]; editable: boolean;
  onDataset: (key: string) => void; onFilters: (filters: Filters) => void;
  onSchema: (key: string, schema: DatasetQuerySchema | null, error: string | null) => void;
}) {
  const resource = useApi<DatasetQuerySchema>(datasetKey ? "schema/" + datasetKey : null);
  const schema = resource.data?.datasetKey === datasetKey ? resource.data : null;
  React.useEffect(() => { onSchema(datasetKey, schema, resource.error); }, [datasetKey, schema, resource.error, onSchema]);
  return <div className="axis-form-stack">
    {editable && <DatasetSelect datasets={datasets} value={datasetKey} onChange={onDataset} />}
    {resource.error && <Notice tone="error">{resource.error}<button type="button" className="axis-link-button" onClick={resource.refresh}>Retry schema</button></Notice>}
    {datasetKey && !schema && !resource.error && <div role="status">Loading filters...</div>}
    {schema && <DatasetQueryFilters fields={schema.filterFields ?? schema.fields} filters={filters} onChange={onFilters} />}
  </div>;
}

export function DashboardFilters({ query, datasets, onChange, onValidity, editable = true, disabled = false }: {
  query: QueryDefinition; datasets: Dataset[]; onChange: (query: QueryDefinition) => void;
  onValidity: (state: FilterValidity) => void; editable?: boolean; disabled?: boolean;
}) {
  const [schemas, setSchemas] = React.useState<Record<string, { data: DatasetQuerySchema | null; error: string | null }>>({});
  const sources = React.useMemo(() => query.queries ?? [{ datasetKey: query.datasetKey, filters: query.filters }], [query]);
  const receiveSchema = React.useCallback((key: string, schema: DatasetQuerySchema | null, error: string | null) => {
    setSchemas(current => current[key]?.data === schema && current[key]?.error === error ? current : { ...current, [key]: { data: schema, error } });
  }, []);
  const validity = React.useMemo<FilterValidity>(() => {
    if (sources.some(source => !source.datasetKey)) return { query: null, error: null, waiting: false };
    const failed = sources.find(source => schemas[source.datasetKey]?.error);
    if (failed) return { query: null, error: schemas[failed.datasetKey].error, waiting: false };
    if (sources.some(source => !schemas[source.datasetKey]?.data)) return { query: null, error: null, waiting: true };
    try {
      const normalized = sources.map(source => {
        const schema = schemas[source.datasetKey].data!;
        return { datasetKey: source.datasetKey, filters: validateFilters(filtersForSchema(source.filters, schema.filterFields ?? schema.fields)) };
      });
      return { query: { ...normalized[0], ...(normalized.length > 1 ? { queries: normalized } : {}) }, error: null, waiting: false };
    } catch (caught) { return { query: null, error: caught instanceof Error ? caught.message : "Invalid filters.", waiting: false }; }
  }, [sources, schemas]);
  const validityKey = JSON.stringify(validity);
  React.useEffect(() => { onValidity(JSON.parse(validityKey) as FilterValidity); }, [validityKey, onValidity]);
  const replace = (next: typeof sources) => onChange({ ...next[0], ...(next.length > 1 ? { queries: next } : {}) });
  const available = datasets.filter(dataset => dataset.key !== POLYGON_ACTIVITY_DATASET_KEY);
  const unused = available.filter(dataset => !sources.some(source => source.datasetKey === dataset.key));
  return <fieldset className="axis-report-filter-fields" disabled={disabled}>
    <div className="axis-report-filter-note"><span>{sources.filter(source => source.datasetKey).length} datasets</span><button type="button" className="axis-link-button" onClick={() => replace(sources.map(source => ({ ...source, filters: {} })))}><RotateCcw size={13} />Reset filters</button></div>
    {sources.map((source, index) => <details open className="axis-report-source" key={index + ":" + source.datasetKey}>
      <summary>{datasets.find(dataset => dataset.key === source.datasetKey)?.name ?? "Choose dataset"}</summary>
      <div className="axis-report-source-content">
        {editable && sources.length > 1 && <button type="button" className="axis-link-button" aria-label={"Remove source " + (index + 1)} onClick={() => replace(sources.filter((_, sourceIndex) => sourceIndex !== index))}><X size={13} />Remove source</button>}
        <SourceFilters datasetKey={source.datasetKey} filters={source.filters} datasets={available.filter(dataset => !sources.some((other, otherIndex) => otherIndex !== index && other.datasetKey === dataset.key))} editable={editable}
          onDataset={key => replace(sources.map((item, sourceIndex) => sourceIndex === index ? { datasetKey: key, filters: {} } : item))}
          onFilters={filters => replace(sources.map((item, sourceIndex) => sourceIndex === index ? { ...item, filters } : item))} onSchema={receiveSchema} />
      </div>
    </details>)}
    {editable && <button type="button" className="axis-button secondary" disabled={!unused.length || sources.some(source => !source.datasetKey) || sources.length >= 20} onClick={() => replace([...sources, { datasetKey: unused[0].key, filters: {} }])}><Plus size={14} />Add dataset</button>}
    {validity.error && <Notice tone="error">{validity.error}</Notice>}
    <p className="axis-report-filter-help">Filters apply to every visual. Changes update automatically.</p>
  </fieldset>;
}
