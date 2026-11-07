"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Filter, RefreshCw } from "lucide-react";
import type { Dataset, QueryDefinition, SavedDocument } from "@/lib/axis/model";
import { DashboardFilters, type FilterValidity } from "./dashboard-filters";
import { DashboardReport, type ReportStatus } from "./dashboard-report";
import { useApi, Notice, Loading, PageIntro } from "./shared";
import { renewEntity, removeEntity, useAxisWallet, walletError } from "./wallet";
import { DashboardBuilder } from "./dashboard-builder";

export { DashboardCatalog } from "./dashboard-catalog";
export { DashboardBuilder };

function PublicReport({ dashboard, owned, busy, onManage, error, message, onError, onMessage }: {
  dashboard: SavedDocument; owned: boolean; busy: boolean; onManage: (action: "renew" | "delete") => void;
  error: string | null; message: string | null; onError: (message: string) => void; onMessage: (message: string) => void;
}) {
  const doc = dashboard.document;
  const catalog = useApi<{ datasets: Dataset[] }>("datasets");
  const [draft, setDraft] = React.useState<QueryDefinition>(doc.query ?? doc.widgets[0].query);
  const [applied, setApplied] = React.useState<QueryDefinition | null>(doc.query ?? null);
  const [changed, setChanged] = React.useState(false), [filtersOpen, setFiltersOpen] = React.useState(true);
  const [revision, setRevision] = React.useState(0), [refreshMs, setRefreshMs] = React.useState(doc.refreshMs);
  const [validity, setValidity] = React.useState<FilterValidity>({ query: null, error: null, waiting: true });
  const [status, setStatus] = React.useState<ReportStatus>({ loading: false, error: null, fetchedAt: null });
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
    <header className="axis-report-studio-header"><div><Link className="axis-inline-link" href="/dashboards"><ArrowLeft size={14} />Dashboards</Link><h1>{dashboard.title}</h1>{doc.description && <p>{doc.description}</p>}</div><div className="axis-actions"><button type="button" className="axis-button secondary" onClick={() => void navigator.clipboard.writeText(window.location.href).then(() => onMessage("Public dashboard URL copied.")).catch(() => onError("Copy the current address from your browser."))}>Copy public URL</button>{owned && <Link className="axis-button" href={"/dashboards/" + dashboard.key + "/edit"}>Edit dashboard</Link>}</div></header>
    <div className="axis-report-toolbar"><button type="button" className="axis-button secondary" aria-pressed={filtersOpen} onClick={() => setFiltersOpen(value => !value)}><Filter size={15} />Filters</button><div className="axis-report-refresh"><button type="button" className="axis-icon-button" aria-label="Refresh report" disabled={status.loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} /></button><label htmlFor="viewer-refresh">Auto refresh</label><select id="viewer-refresh" value={refreshMs} onChange={event => setRefreshMs(Number(event.target.value))}><option value={0}>Off</option><option value={30000}>30 seconds</option><option value={60000}>1 minute</option><option value={300000}>5 minutes</option></select></div></div>
    <div className="axis-report-status" role="status"><span className={pending || status.loading ? "is-updating" : ""}><i />{validity.error && changed ? "Filters not applied" : pending ? "Applying filters..." : status.loading ? "Updating report..." : status.fetchedAt ? "Updated " + new Date(status.fetchedAt).toLocaleTimeString() : "Verified source data"}</span><span>{doc.widgets.length} visuals{changed && " · Your filters apply to this view"}</span></div>
    {error && <Notice tone="error">{error}</Notice>}{message && <Notice tone="success">{message}</Notice>}
    <div className={"axis-report-workspace without-properties" + (!filtersOpen ? " without-filters" : "")}>
      {filtersOpen && <aside className="axis-report-pane axis-report-filters" aria-label="Dashboard filters"><div className="axis-report-pane-heading"><Filter size={16} /><h2>Dashboard filters</h2></div><DashboardFilters query={draft} datasets={catalog.data?.datasets ?? []} onChange={query => { setDraft(query); setChanged(true); }} onValidity={receiveValidity} editable={false} /></aside>}
      <DashboardReport document={doc} query={changed ? applied : doc.query} refreshMs={refreshMs} revision={revision} onStatus={receiveStatus} showHeading={false} />
    </div>
    <details className="axis-dashboard-definition"><summary>Dashboard details</summary><dl className="axis-details"><dt>Owner</dt><dd className="axis-mono">{dashboard.owner}</dd><dt>Definition expires</dt><dd>Arkiv block {dashboard.expiresAt}</dd><dt>Saved refresh interval</dt><dd>{doc.refreshMs ? "Every " + doc.refreshMs / 1000 + "s" : "Manual"}</dd></dl>{owned && <div className="axis-actions"><button className="axis-button secondary" disabled={busy} onClick={() => onManage("renew")}>Renew dashboard</button><button className="axis-button secondary" disabled={busy} onClick={() => onManage("delete")}>Delete definition</button></div>}</details>
  </div>;
}

export function DashboardView({ entityKey, edit = false }: { entityKey: string; edit?: boolean }) {
  const resource = useApi<{ dashboard: SavedDocument }>("dashboards/" + entityKey), wallet = useAxisWallet(), router = useRouter();
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState<string | null>(null), [message, setMessage] = React.useState<string | null>(null);
  const dashboard = resource.data?.dashboard;
  const action = async (kind: "renew" | "delete") => {
    if (!wallet.address) return;
    if (kind === "delete" && !window.confirm("Delete this dashboard definition from current Arkiv queries? Its underlying datasets remain available.")) return;
    setBusy(true); setError(null);
    try {
      if (kind === "renew") { await renewEntity(wallet.address, entityKey); setMessage("Dashboard renewed for 30 days from now."); resource.refresh(); }
      else { await removeEntity(wallet.address, entityKey); router.push("/dashboards"); }
    } catch (caught) { setError(walletError(caught)); } finally { setBusy(false); }
  };
  if (edit && dashboard) return dashboard.owner === wallet.address?.toLowerCase()
    ? <DashboardBuilder editing={dashboard} />
    : <Notice>Connect the dashboard owner wallet to edit this definition.</Notice>;
  if (!dashboard) return <><PageIntro title="Public dashboard" />{resource.error ? <Notice tone="error">{resource.error}<button className="axis-link-button" onClick={resource.refresh}>Try again</button></Notice> : <Loading />}</>;
  return <PublicReport dashboard={dashboard} owned={dashboard.owner === wallet.address?.toLowerCase()} busy={busy} onManage={kind => void action(kind)} error={error} message={message} onError={setError} onMessage={setMessage} />;
}
