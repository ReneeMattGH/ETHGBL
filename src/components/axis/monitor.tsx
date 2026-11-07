"use client";

import type { IngestionCounts } from "@/lib/axis/ingestion-counts";
import { useApi, PageIntro, Panel, Stat, Notice, RefreshButton, Empty, Loading } from "./shared";

const number = (value: string) => BigInt(value).toLocaleString("en-US");

export function IngestionMonitor() {
  const resource = useApi<IngestionCounts>("ingestion/counts", 15000);
  const data = resource.error ? null : resource.data;
  return <>
    <PageIntro title="Ingestion Monitor"><RefreshButton loading={resource.loading} onClick={resource.refresh} /></PageIntro>
    {resource.error && <Notice tone="error">{resource.error}</Notice>}
    <div className="axis-stats axis-ingestion-stats">
      <Stat label="Rows stored on Arkiv" value={data ? number(data.rows) : "—"} />
      <Stat label="Block entries" value={data ? number(data.blocks) : "—"} />
      <Stat label="Tables with data" value={data ? data.tables.length.toLocaleString("en-US") : "—"} />
    </div>
    <Panel title="Data on Arkiv" className="axis-table-panel">
      {!data ? !resource.error && <Loading /> : !data.tables.length ? <Empty>No rows stored yet.</Empty> : <>
        <div className="axis-table-wrap"><table aria-label="Arkiv stored data">
          <thead><tr><th>Table</th><th>Stored rows</th></tr></thead>
          <tbody>{data.tables.map(table => <tr key={table.id}><td>{table.name}</td><td>{number(table.rows)}</td></tr>)}</tbody>
        </table></div>
        <div className="axis-ingestion-updated">Updated <time dateTime={data.fetchedAt}>{new Date(data.fetchedAt).toLocaleTimeString()}</time></div>
      </>}
    </Panel>
  </>;
}
