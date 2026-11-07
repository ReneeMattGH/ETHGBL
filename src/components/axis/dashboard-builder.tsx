"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BarChart3, ChevronDown, Eye, Filter, LayoutDashboard, PanelRight, Plus, RefreshCw, Save, Upload } from "lucide-react";
import type { AxisWidget, DashboardDocument, Dataset, QueryDefinition, SavedDocument } from "@/lib/axis/model";
import { validateDashboard, validateFilters, validateQuerySources } from "@/lib/axis/core";
import { DASHBOARD_DRAFT_KEY, dashboardFingerprint, dashboardStarter, moveVisual, normalizeDashboard } from "@/lib/axis/dashboard-document";
import { api, Field, Notice, useApi } from "./shared";
import { publishDashboard, useAxisWallet, walletError } from "./wallet";
import { DashboardFilters, type FilterValidity } from "./dashboard-filters";
import { DashboardReport, type ReportStatus } from "./dashboard-report";
import { ChartSettings } from "./chart-settings";
import { changeChartKind, chartGroupings } from "@/lib/axis/chart-config";
import { CHART_INTERVALS } from "@/lib/axis/model";
import { DashboardDeployButton } from "./dashboard-deploy";

export function DashboardBuilder({ editing }: { editing?: SavedDocument }) {
  const params = useSearchParams(), router = useRouter(), wallet = useAxisWallet();
  const catalog = useApi<{ datasets: Dataset[] }>("datasets");
  const [initial] = React.useState(() => {
    try {
      const filters = validateFilters(JSON.parse(params.get("filters") ?? "{}"));
      const queries = params.get("queries") ? validateQuerySources(JSON.parse(params.get("queries")!)) : undefined;
      const query: QueryDefinition = editing?.document.query ?? editing?.document.widgets[0]?.query ?? { datasetKey: queries?.[0].datasetKey ?? params.get("dataset") ?? "", filters, ...(queries ? { queries } : {}) };
      return { query, error: null as string | null };
    } catch { return { query: { datasetKey: "", filters: {} } as QueryDefinition, error: "The linked query filters are invalid. Choose your datasets again." }; }
  });
  const [doc, setDoc] = React.useState<DashboardDocument>(() => {
    if (editing) return normalizeDashboard(editing.document);
    const widgets = dashboardStarter(initial.query);
    const chart = params.get("chart");
    if (chart) {
      const allowed = ["stacked-area", "share-area", "treemap", "donut", "ranked", "heatmap", "combo"];
      if (allowed.includes(chart)) widgets[4] = { ...changeChartKind(widgets[4], chart as AxisWidget["kind"]), title: params.get("chartTitle")?.slice(0, 100) || widgets[4].title };
    }
    const grouping = params.get("grouping"), interval = params.get("interval"), measure = params.get("measure");
    if (chartGroupings(widgets[4].kind).includes(grouping as AxisWidget["grouping"])) widgets[4].grouping = grouping as AxisWidget["grouping"];
    if (CHART_INTERVALS.includes(interval as typeof CHART_INTERVALS[number])) widgets[4].interval = interval as typeof CHART_INTERVALS[number];
    if (measure === "amount" || measure === "transfers") widgets[4].metric = measure;
    return { version: 1, title: "", description: "", refreshMs: 30000, query: initial.query, widgets };
  });
  const [draftQuery, setDraftQuery] = React.useState(initial.query);
  const [filtersEdited, setFiltersEdited] = React.useState(false);
  const [validity, setValidity] = React.useState<FilterValidity>({ query: null, error: null, waiting: true });
  const [applied, setApplied] = React.useState<QueryDefinition | null>(null);
  const [selected, setSelected] = React.useState<string | null>(editing?.document.widgets[0]?.id ?? "activity");
  const [filtersOpen, setFiltersOpen] = React.useState(true), [propertiesOpen, setPropertiesOpen] = React.useState(true), [preview, setPreview] = React.useState(false);
  const [revision, setRevision] = React.useState(0), [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(initial.error), [message, setMessage] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<ReportStatus>({ loading: false, error: null, fetchedAt: null });
  const propertiesRef = React.useRef<HTMLElement>(null), addMenu = React.useRef<HTMLDetailsElement>(null);
  const saved = React.useRef<{ entityKey: string; owner: string; document: string | null } | null>(editing ? { entityKey: editing.key, owner: editing.owner.toLowerCase(), document: JSON.stringify(validateDashboard(normalizeDashboard(editing.document))) } : null);
  const legacy = Boolean(editing && !editing.document.query && !filtersEdited);
  const validKey = validity.query ? JSON.stringify(validity.query) : "";
  React.useEffect(() => {
    if (!validKey || legacy) return;
    const timer = setTimeout(() => setApplied(JSON.parse(validKey) as QueryDefinition), 350);
    return () => clearTimeout(timer);
  }, [validKey, legacy]);
  const receiveValidity = React.useCallback((next: FilterValidity) => setValidity(current => JSON.stringify(current) === JSON.stringify(next) ? current : next), []);
  const receiveStatus = React.useCallback((next: ReportStatus) => setStatus(current => JSON.stringify(current) === JSON.stringify(next) ? current : next), []);
  const pending = !legacy && (validity.waiting || Boolean(validKey && JSON.stringify(applied) !== validKey));
  const blocked = busy || pending || Boolean(validity.error) || (!legacy && !validity.query);
  const active = doc.widgets.find(widget => widget.id === selected);
  const reportDoc = { ...doc, ...(applied && !legacy ? { query: applied, widgets: doc.widgets.map(widget => ({ ...widget, query: applied })) } : {}) };
  const changeQuery = (query: QueryDefinition) => { setDraftQuery(query); setFiltersEdited(true); setMessage(null); };
  const select = (id: string) => {
    setSelected(id); setPropertiesOpen(true);
    if (window.innerWidth < 1250) requestAnimationFrame(() => propertiesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const updateVisual = (patch: Partial<AxisWidget>) => setDoc(current => ({ ...current, widgets: current.widgets.map(widget => widget.id === selected ? { ...widget, ...patch } : widget) }));
  const add = (kind: AxisWidget["kind"]) => {
    if (doc.widgets.length >= 12) return;
    const query = applied ?? validity.query ?? draftQuery;
    const template = dashboardStarter(query).find(widget => widget.kind === kind) ?? { ...dashboardStarter(query)[4], ...changeChartKind(dashboardStarter(query)[4], kind), title: kind === "table" ? "Transfer records" : "Composition analysis", description: kind === "table" ? "The latest matching verified transfers, with source attribution." : "Compare the composition of the current filtered result." };
    const widget = { ...template, id: crypto.randomUUID(), width: kind === "table" ? 2 as const : template.width };
    setDoc(current => ({ ...current, widgets: [...current.widgets, widget] })); select(widget.id);
    if (addMenu.current) addMenu.current.open = false;
  };
  const duplicate = (id: string) => {
    const original = doc.widgets.find(widget => widget.id === id);
    if (!original || doc.widgets.length >= 12) return;
    const widget = { ...original, id: crypto.randomUUID(), title: (original.title + " copy").slice(0, 100) };
    setDoc(current => ({ ...current, widgets: [...current.widgets, widget] })); select(widget.id);
  };
  const remove = (id: string) => { setDoc(current => ({ ...current, widgets: current.widgets.filter(widget => widget.id !== id) })); if (selected === id) setSelected(null); };
  const saveDraft = () => {
    try { localStorage.setItem(DASHBOARD_DRAFT_KEY, JSON.stringify(reportDoc)); setMessage("Local draft saved."); setError(null); } catch { setError("Your browser could not save the draft."); }
  };
  const restore = () => {
    try {
      const raw = localStorage.getItem(DASHBOARD_DRAFT_KEY); if (!raw) throw new Error("No local draft exists.");
      const candidate = JSON.parse(raw) as DashboardDocument;
      const restored = normalizeDashboard(validateDashboard({ ...candidate, title: candidate.title || "Draft dashboard" }));
      restored.title = candidate.title;
      setDoc(restored); setDraftQuery(restored.query ?? restored.widgets[0].query); setFiltersEdited(true); setSelected(restored.widgets[0]?.id ?? null); setMessage("Local draft restored."); setError(null);
    } catch (caught) { setError(walletError(caught)); }
  };
  const persist = async () => {
    const document = validateDashboard(reportDoc), serialized = JSON.stringify(document);
    const account = wallet.address ?? await wallet.connect();
    if (saved.current && saved.current.owner !== account.toLowerCase()) throw new Error("Connect the dashboard owner to update or deploy this definition.");
    if (saved.current?.document !== serialized) {
      const queries = [...new Map(document.widgets.map(widget => { const query = document.query ?? widget.query; return [JSON.stringify(query), query]; })).values()];
      await Promise.all(queries.map(query => api("query", { ...query, mode: "analytics" })));
      const published = await publishDashboard(account, document, saved.current?.entityKey);
      // Keep the key even if a read fails, so retrying updates the same entity.
      saved.current = { entityKey: published.entityKey, owner: account.toLowerCase(), document: null };
    }
    const entityKey = saved.current!.entityKey;
    const readback = await api<{ dashboard: SavedDocument }>("dashboards/" + entityKey);
    if (JSON.stringify(readback.dashboard.document) !== serialized || readback.dashboard.owner.toLowerCase() !== account.toLowerCase()) throw new Error("Published dashboard readback differs from the editor.");
    saved.current!.document = serialized;
    localStorage.removeItem(DASHBOARD_DRAFT_KEY);
    return { entityKey, documentHash: dashboardFingerprint(document) };
  };
  const publish = async () => {
    if (blocked) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const published = await persist();
      router.push("/dashboards/" + published.entityKey);
    } catch (caught) { setError(walletError(caught)); } finally { setBusy(false); }
  };
  const statusText = validity.error ? "Filters not applied" : pending ? "Applying filters..." : status.loading ? "Updating report..." : status.error ? "Data unavailable" : legacy ? "Individual visual queries" : status.fetchedAt ? "Updated " + new Date(status.fetchedAt).toLocaleTimeString() : "Choose your data";
  return <div className="axis-report-studio">
    <header className="axis-report-studio-header"><div><h1>{editing ? "Edit dashboard" : "Dashboard Builder"}</h1><p>Build a report from your verified data. Filter, arrange and explain every visual.</p></div><div className="axis-actions"><button type="button" className="axis-button secondary" disabled={busy} aria-pressed={preview} onClick={() => setPreview(value => !value)}><Eye size={15} />{preview ? "Edit report" : "Preview report"}</button><button type="button" className="axis-button secondary" disabled={blocked || !doc.widgets.length || !doc.title.trim()} onClick={() => void publish()}><Upload size={15} />{busy ? "Saving..." : editing ? "Update dashboard on Arkiv" : "Publish dashboard to Arkiv"}</button><DashboardDeployButton disabled={blocked || !doc.widgets.length || !doc.title.trim()} prepare={persist} onBusyChange={setBusy} onError={setError} /></div></header>
    {!preview && <fieldset className="axis-report-definition" disabled={busy}><Field label="Dashboard title"><input value={doc.title} maxLength={80} onChange={event => setDoc({ ...doc, title: event.target.value })} /></Field><Field label="Short explanation"><textarea rows={2} value={doc.description} maxLength={2000} onChange={event => setDoc({ ...doc, description: event.target.value })} /></Field></fieldset>}
    <div className="axis-report-toolbar"><div className="axis-actions">
      {!preview && <details className="axis-report-add" ref={addMenu}><summary className="axis-button" aria-disabled={busy || doc.widgets.length >= 12}><Plus size={15} />Add visual<ChevronDown size={13} /></summary><div>{([["metric", "Key metric"], ["stacked-area", "Activity composition"], ["share-area", "Percentage composition"], ["treemap", "Allocation treemap"], ["ranked", "Wallet concentration"], ["heatmap", "Activity heatmap"], ["combo", "Volume & activity"], ["table", "Transfer records"]] as const).map(([kind, label]) => <button type="button" disabled={busy || doc.widgets.length >= 12} key={kind} onClick={() => add(kind)}><BarChart3 size={15} />{label}</button>)}</div></details>}
      <button type="button" className="axis-button secondary" aria-pressed={filtersOpen} onClick={() => setFiltersOpen(value => !value)}><Filter size={15} />Filters</button>
      {!preview && <button type="button" className="axis-button secondary" aria-pressed={propertiesOpen} onClick={() => setPropertiesOpen(value => !value)}><PanelRight size={15} />Properties</button>}
      {!preview && <><button type="button" className="axis-button secondary" disabled={blocked || !doc.widgets.length} onClick={saveDraft}><Save size={15} />Save local draft</button><button type="button" className="axis-link-button" disabled={busy} onClick={restore}>Restore draft</button></>}
    </div><div className="axis-report-refresh"><button type="button" className="axis-icon-button" aria-label="Refresh report" disabled={busy || status.loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} /></button><label htmlFor="report-refresh">Auto refresh</label><select id="report-refresh" disabled={busy} value={doc.refreshMs} onChange={event => setDoc({ ...doc, refreshMs: Number(event.target.value) })}><option value={0}>Off</option><option value={30000}>30 seconds</option><option value={60000}>1 minute</option><option value={300000}>5 minutes</option></select></div></div>
    <div className="axis-report-status" role="status" aria-live="polite"><span className={status.loading || pending ? "is-updating" : ""}><i />{statusText}</span><span><LayoutDashboard size={13} />{doc.widgets.length} / 12 visuals{doc.refreshMs ? " · Refreshes every " + doc.refreshMs / 1000 + "s" : " · Manual refresh"}</span></div>
    {error && <Notice tone="error">{error}</Notice>}{message && <Notice tone="success">{message}</Notice>}{catalog.error && <Notice tone="error">{catalog.error}<button className="axis-link-button" onClick={catalog.refresh}>Retry datasets</button></Notice>}
    <div className={"axis-report-workspace" + (!filtersOpen ? " without-filters" : "") + (!propertiesOpen || preview ? " without-properties" : "")}>
      {filtersOpen && <aside className="axis-report-pane axis-report-filters" aria-label="Data and filters"><div className="axis-report-pane-heading"><Filter size={16} /><h2>Data & filters</h2></div><DashboardFilters query={draftQuery} datasets={catalog.data?.datasets ?? []} onChange={changeQuery} onValidity={receiveValidity} editable={!preview} disabled={busy} /></aside>}
      <DashboardReport document={reportDoc} query={legacy ? undefined : applied} refreshMs={doc.refreshMs} revision={revision} onStatus={receiveStatus} editor={preview || busy ? undefined : { selectedId: selected, onSelect: select, onMove: (from, to) => setDoc(current => ({ ...current, widgets: moveVisual(current.widgets, from, to) })), onDuplicate: duplicate, onRemove: remove }} />
      {propertiesOpen && !preview && <aside ref={propertiesRef} className="axis-report-pane axis-report-properties" aria-label="Visual properties"><div className="axis-report-pane-heading"><PanelRight size={16} /><h2>Visual properties</h2></div>{active ? <fieldset disabled={busy} className="axis-form-stack"><span className="axis-report-property-context">Editing selected visual</span><Field label="Visual title"><input value={active.title} maxLength={100} onChange={event => updateVisual({ title: event.target.value })} /></Field><Field label="Visual explanation"><textarea rows={3} value={active.description ?? ""} maxLength={240} onChange={event => updateVisual({ description: event.target.value })} /></Field><ChartSettings widget={active} onChange={updateVisual} includeMetric /><Field label="Visual width"><select value={active.width} onChange={event => updateVisual({ width: Number(event.target.value) as 1 | 2 })}><option value={1}>{active.kind === "metric" ? "Compact card" : "Half width"}</option><option value={2}>Full width</option></select></Field><p className="axis-report-filter-help">Select a title on the canvas to edit its visual. Drag the handle or use the arrow controls to rearrange.</p></fieldset> : <p className="axis-report-filter-help">Select a visual on the canvas to edit its title, explanation and chart settings.</p>}</aside>}
    </div>
  </div>;
}
