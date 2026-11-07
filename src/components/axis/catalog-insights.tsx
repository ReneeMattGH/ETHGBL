"use client";

import type { CatalogInsights } from "@/lib/axis/catalog-insight-model";
import { CatalogDataChart } from "./charts";
import { Empty, Loading, Notice, Stat, useApi } from "./shared";

export function CollectionInsights({ view, entryId, importKey, revision }: { view: string; entryId: string; importKey?: string | null; revision: number }) {
  const params = new URLSearchParams({ view, item: entryId, revision: String(revision), ...(importKey ? { import: importKey } : {}) });
  const resource = useApi<CatalogInsights>(`catalog/insights?${params}`, 30000);
  const data = resource.data?.entryId === entryId ? resource.data : null;
  return <div className="axis-catalog-activity" aria-label="Collection analytics">
    {resource.error && <Notice tone="error">{resource.error}</Notice>}
    {!data && !resource.error && <Loading />}
    {data?.status === "not-indexed" && <Empty>No published analytics for this collection yet.</Empty>}
    {data?.status === "available" && <>
      <div className="axis-stats">{data.metrics.map(metric => <Stat key={metric.label} label={metric.label} value={metric.value} />)}</div>
      {data.charts.map(chart => <section className="axis-catalog-chart" key={`${entryId}:${chart.title}`} aria-label={chart.title}><div className="axis-catalog-chart-header"><h3>{chart.title}</h3></div><CatalogDataChart chart={chart} /></section>)}
      {data.source && <details className="axis-evidence"><summary>Source & coverage</summary><dl className="axis-details"><dt>Source</dt><dd>{data.source.name}</dd><dt>Table</dt><dd>{data.source.table}</dd>{data.source.throughBlock && <><dt>Verified blocks</dt><dd>{data.source.fromBlock}–{data.source.throughBlock}</dd></>}<dt>Read at</dt><dd>{new Date(data.source.fetchedAt).toLocaleString()}</dd></dl><pre>{data.source.executedQuery}</pre></details>}
    </>}
  </div>;
}
