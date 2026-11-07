"use client";

import * as React from "react";
import { Copy, Filter, RefreshCw } from "lucide-react";
import type { Dataset, QueryDefinition, SavedDocument } from "@/lib/axis/model";
import { DashboardFilters, type FilterValidity } from "./dashboard-filters";
import { DashboardReport, type ReportStatus } from "./dashboard-report";
import { AxisApiProvider, Notice, useApi } from "./shared";

export function ReportWebsite({ dashboard }: { dashboard: SavedDocument }) {
  return <AxisApiProvider basePath={`/api/reports/${dashboard.key}/`}><Website dashboard={dashboard} /></AxisApiProvider>;
}

function Website({ dashboard }: { dashboard: SavedDocument }) {
  const doc = dashboard.document, catalog = useApi<{ datasets: Dataset[] }>("datasets");
  const [draft, setDraft] = React.useState<QueryDefinition>(doc.query ?? doc.widgets[0].query);
  const [applied, setApplied] = React.useState<QueryDefinition | null>(doc.query ?? null);
  const [changed, setChanged] = React.useState(false), [filtersOpen, setFiltersOpen] = React.useState(true);
  const [revision, setRevision] = React.useState(0), [refreshMs, setRefreshMs] = React.useState(doc.refreshMs);
  const [validity, setValidity] = React.useState<FilterValidity>({ query: null, error: null, waiting: true });
  const [status, setStatus] = React.useState<ReportStatus>({ loading: false, error: null, fetchedAt: null });
  const [copyMessage, setCopyMessage] = React.useState("");
  const key = validity.query ? JSON.stringify(validity.query) : "";
  React.useEffect(() => {
    if (!changed || !key) return;
    const timer = setTimeout(() => setApplied(JSON.parse(key) as QueryDefinition), 350);
    return () => clearTimeout(timer);
  }, [changed, key]);
  const receiveValidity = React.useCallback((next: FilterValidity) => setValidity(current => JSON.stringify(current) === JSON.stringify(next) ? current : next), []);
  const receiveStatus = React.useCallback((next: ReportStatus) => setStatus(current => JSON.stringify(current) === JSON.stringify(next) ? current : next), []);
  const pending = changed && (validity.waiting || Boolean(key && JSON.stringify(applied) !== key));
  return <div className="axis-report-studio axis-public-report">
    <header className="axis-report-studio-header"><div><span className="axis-report-eyebrow">PUBLIC DASHBOARD</span><h1>{dashboard.title}</h1>{doc.description && <p>{doc.description}</p>}</div><button type="button" className="axis-button secondary" onClick={() => void navigator.clipboard.writeText(window.location.href).then(() => setCopyMessage("Link copied.")).catch(() => setCopyMessage("Copy the website address from your browser."))}><Copy size={15} />Copy link</button></header>
    <div className="axis-report-toolbar"><button type="button" className="axis-button secondary" aria-pressed={filtersOpen} onClick={() => setFiltersOpen(value => !value)}><Filter size={15} />Filters</button><div className="axis-report-refresh"><button type="button" className="axis-icon-button" aria-label="Refresh report" disabled={status.loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} /></button><label htmlFor="website-refresh">Auto refresh</label><select id="website-refresh" value={refreshMs} onChange={event => setRefreshMs(Number(event.target.value))}><option value={0}>Off</option><option value={30000}>30 seconds</option><option value={60000}>1 minute</option><option value={300000}>5 minutes</option></select></div></div>
    <div className="axis-report-status" role="status" aria-live="polite"><span className={pending || status.loading ? "is-updating" : ""}><i />{changed && validity.error ? "Filters not applied" : pending ? "Applying filters..." : status.loading ? "Updating report..." : status.error ? "Data unavailable" : status.fetchedAt ? "Updated " + new Date(status.fetchedAt).toLocaleTimeString() : "Reading verified data..."}</span><span>{doc.widgets.length} visuals{changed && " · Filters apply to your view"}</span></div>
    {copyMessage && <Notice>{copyMessage}</Notice>}
    {catalog.error && <Notice tone="error">{catalog.error}<button type="button" className="axis-link-button" onClick={catalog.refresh}>Retry datasets</button></Notice>}
    <div className={"axis-report-workspace without-properties" + (!filtersOpen ? " without-filters" : "")}>
      {filtersOpen && <aside className="axis-report-pane axis-report-filters" aria-label="Dashboard filters"><div className="axis-report-pane-heading"><Filter size={16} /><h2>Dashboard filters</h2></div><DashboardFilters query={draft} datasets={catalog.data?.datasets ?? []} onChange={query => { setDraft(query); setChanged(true); }} onValidity={receiveValidity} editable={false} /></aside>}
      <DashboardReport document={doc} query={changed ? applied : doc.query} refreshMs={refreshMs} revision={revision} onStatus={receiveStatus} showHeading={false} />
    </div>
  </div>;
}
