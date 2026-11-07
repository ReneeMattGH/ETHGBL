"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Copy, GripVertical, Pencil, Trash2 } from "lucide-react";
import type { AxisWidget, DashboardDocument, QueryDefinition, QueryResult } from "@/lib/axis/model";
import { METRIC_LABELS } from "@/lib/axis/model";
import { validateFilters } from "@/lib/axis/core";
import { AnalyticsChart } from "./charts";
import { Empty, Notice, QueryEvidence, TransferTable, useApi } from "./shared";

export type ReportStatus = { loading: boolean; error: string | null; fetchedAt: string | null };
type Editing = { selectedId: string | null; onSelect: (id: string) => void; onMove: (from: number, to: number) => void; onDuplicate: (id: string) => void; onRemove: (id: string) => void };
type VisualProps = { widget: AxisWidget; index: number; count: number; result: QueryResult | null; loading: boolean; editor?: Editing };

function Visual({ widget, index, count, result, loading, editor }: VisualProps) {
  const amount = ["amount", "averageAmount", "medianAmount", "p90Amount", "largestAmount"].includes(widget.metric);
  const value = result?.analytics?.[widget.metric];
  const exact = value == null ? "Unavailable" : typeof value === "number" ? value.toLocaleString() : value;
  const display = typeof value === "string" && value.length > 10 && Number.isFinite(Number(value)) ? Number(value).toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 }) : exact;
  return <section className={"axis-report-visual width-" + widget.width + " kind-" + widget.kind + (editor?.selectedId === widget.id ? " is-selected" : "") + (widget.id === "activity" ? " axis-insight-chart" : "")} aria-label={widget.title || METRIC_LABELS[widget.metric]}
    onDragOver={event => { if (editor && event.dataTransfer.types.includes("application/x-axis-visual")) event.preventDefault(); }}
    onDrop={event => { if (!editor || !event.dataTransfer.types.includes("application/x-axis-visual")) return; const from = Number(event.dataTransfer.getData("application/x-axis-visual")); if (Number.isInteger(from)) { event.preventDefault(); editor.onMove(from, index); } }}>
    <header className="axis-report-visual-header"><div><h3>{editor ? <button type="button" className="axis-report-select" aria-label={"Edit " + widget.title} aria-pressed={editor.selectedId === widget.id} onClick={() => editor.onSelect(widget.id)}>{widget.title || METRIC_LABELS[widget.metric]}</button> : widget.title || METRIC_LABELS[widget.metric]}</h3>{widget.description && <p>{widget.description}</p>}</div>
      {editor && <div className="axis-report-visual-tools"><button type="button" className="axis-icon-button axis-report-grip" draggable aria-label={"Drag " + widget.title} title="Drag to reorder" onDragStart={event => { event.dataTransfer.setData("application/x-axis-visual", String(index)); event.dataTransfer.effectAllowed = "move"; }}><GripVertical size={14} /></button><button type="button" className="axis-icon-button" aria-label={"Edit properties for " + widget.title} onClick={() => editor.onSelect(widget.id)}><Pencil size={13} /></button></div>}
    </header>
    {!result ? <div className="axis-report-visual-empty" role={loading ? "status" : undefined}>{loading ? <><span className="axis-report-spinner" />Updating visual...</> : "No verified result loaded"}</div>
      : widget.kind === "metric" ? <div className="axis-report-metric"><strong title={exact} aria-label={"Exact value: " + exact + (amount ? " USDC" : "")}>{display}</strong>{amount && <span>USDC</span>}</div>
        : widget.kind === "table" ? <TransferTable rows={result.entities ?? []} sources={result.recordDatasets} />
          : result.analytics && <AnalyticsChart key={JSON.stringify(widget.query)} analytics={result.analytics} widget={widget} />}
    {editor && <div className="axis-report-tile-actions"><span>{widget.kind === "metric" ? "Key metric" : widget.kind === "table" ? "Verified records" : "Interactive visual"}</span><div><button type="button" className="axis-icon-button" disabled={index === 0} aria-label={"Move " + widget.title + " up"} onClick={() => editor.onMove(index, index - 1)}><ArrowUp size={13} /></button><button type="button" className="axis-icon-button" disabled={index === count - 1} aria-label={"Move " + widget.title + " down"} onClick={() => editor.onMove(index, index + 1)}><ArrowDown size={13} /></button><button type="button" className="axis-icon-button" disabled={count >= 12} aria-label={"Duplicate " + widget.title} onClick={() => editor.onDuplicate(widget.id)}><Copy size={13} /></button><button type="button" className="axis-icon-button" aria-label={"Remove " + widget.title} onClick={() => editor.onRemove(widget.id)}><Trash2 size={13} /></button></div></div>}
  </section>;
}
function LegacyVisual({ widget, index, count, refreshMs, editor }: Omit<VisualProps, "result" | "loading"> & { refreshMs: number }) {
  const resource = useApi<QueryResult>("query", refreshMs, { ...widget.query, filters: validateFilters(widget.query.filters), mode: widget.kind === "table" ? "page" : "analytics", limit: 25 });
  return <div className={"axis-report-legacy width-" + widget.width + " kind-" + widget.kind}>{resource.error && <Notice tone="error">{resource.error}</Notice>}<Visual widget={widget} index={index} count={count} result={resource.data} loading={resource.loading} editor={editor} /></div>;
}

export function DashboardReport({ document: doc, query, refreshMs = 0, revision = 0, editor, onStatus, showHeading = true }: {
  document: DashboardDocument; query?: QueryDefinition | null; refreshMs?: number; revision?: number; editor?: Editing;
  onStatus?: (status: ReportStatus) => void;
  showHeading?: boolean;
}) {
  const needed = doc.widgets.some(widget => widget.kind !== "table"), tableNeeded = doc.widgets.some(widget => widget.kind === "table");
  const [refresh, setRefresh] = React.useState(0);
  const analytics = useApi<QueryResult>(query?.datasetKey && needed ? "query" : null, refreshMs, { ...query, mode: "analytics", reportRevision: revision + refresh });
  const rows = useApi<QueryResult>(query?.datasetKey && tableNeeded ? "query" : null, refreshMs, { ...query, mode: "page", limit: 25, reportRevision: revision + refresh });
  const result = analytics.data ?? rows.data;
  const error = analytics.error ?? rows.error;
  const statusKey = JSON.stringify({ loading: analytics.loading || rows.loading, error, fetchedAt: result?.fetchedAt ?? null });
  React.useEffect(() => { onStatus?.(JSON.parse(statusKey) as ReportStatus); }, [statusKey, onStatus]);
  return <section className="axis-report-canvas" aria-label="Visual analytics">
    {showHeading && <div className="axis-report-page-heading"><div><span className="axis-report-eyebrow">ANALYTICS REPORT</span><h2>{doc.title || "Untitled dashboard"}</h2><p>{doc.description || "Explore activity, composition and wallet concentration across the selected datasets."}</p></div><span className="axis-report-page-count">{doc.widgets.length} visuals</span></div>}
    {error && <Notice tone="error">{result ? "Refresh failed. Showing the last successful result. " : ""}{error}<button type="button" className="axis-link-button" onClick={() => setRefresh(value => value + 1)}>Retry data</button></Notice>}
    {result && !result.coverage.complete && <Notice>Some sources have partial coverage. Visuals include their verified records.</Notice>}
    {!doc.widgets.length ? <Empty><h3>Your canvas is ready</h3><p>Add a visual from the toolbar to start building your report.</p></Empty> : <div className="axis-report-grid">
      {doc.widgets.map((widget, index) => query === undefined ? <LegacyVisual key={widget.id + ":" + revision} widget={widget} index={index} count={doc.widgets.length} refreshMs={refreshMs} editor={editor} /> : <Visual key={widget.id} widget={{ ...widget, query: query ?? widget.query }} index={index} count={doc.widgets.length} result={widget.kind === "table" ? rows.data : analytics.data} loading={widget.kind === "table" ? rows.loading : analytics.loading} editor={editor} />)}
    </div>}
    {result && <div className="axis-report-provenance"><span>{result.analytics?.transfers?.toLocaleString() ?? result.total ?? ""} matching records{result.fetchedAt ? " · " + new Date(result.fetchedAt).toLocaleTimeString() : ""}</span><QueryEvidence result={result} /></div>}
  </section>;
}
