"use client";
import { CHART_INTERVALS, ANALYTICAL_CHART_KINDS, CHART_LABELS, type AxisWidget } from "@/lib/axis/model";
import { analyticalWidget, changeChartKind, chartGroupings, GROUP_LABELS } from "@/lib/axis/chart-config";
import { Field } from "./shared";

export function ChartSettings({ widget: definition, onChange, includeMetric = false }: { widget: AxisWidget; onChange: (widget: AxisWidget) => void; includeMetric?: boolean }) {
  const widget = analyticalWidget(definition);
  const chart = widget.kind !== "metric" && widget.kind !== "table";
  return <>
    <Field label="Visualization"><select value={widget.kind} onChange={event => onChange(changeChartKind(widget, event.target.value as AxisWidget["kind"]))}>{includeMetric && <option value="metric">Metric</option>}{ANALYTICAL_CHART_KINDS.map(kind => <option key={kind} value={kind}>{CHART_LABELS[kind]}</option>)}{includeMetric && <option value="table">Transfer table</option>}</select></Field>
    {widget.kind !== "table" && widget.kind !== "combo" && <Field label="Measure"><select value={widget.metric} onChange={event => onChange({ ...widget, metric: event.target.value as AxisWidget["metric"] })}><option value="transfers">Transfer count</option><option value="amount">Gross transferred USDC</option>{widget.kind === "metric" && <><option value="uniqueSenders">Unique senders</option><option value="uniqueRecipients">Unique recipients</option><option value="uniqueWallets">Unique wallets (union)</option><option value="averageAmount">Mean transfer size</option><option value="medianAmount">Median transfer size</option><option value="p90Amount">P90 transfer size</option><option value="largestAmount">Largest transfer</option></>}</select></Field>}
    {chart && <Field label="Grouping"><select value={widget.grouping} onChange={event => onChange({ ...widget, grouping: event.target.value as AxisWidget["grouping"] })}>{chartGroupings(widget.kind).map(grouping => <option key={grouping} value={grouping}>{GROUP_LABELS[grouping]}</option>)}</select></Field>}
    {chart && widget.grouping === "time" && <Field label="Time interval"><select value={widget.interval ?? "day"} onChange={event => onChange({ ...widget, interval: event.target.value as AxisWidget["interval"] })}>{CHART_INTERVALS.map(interval => <option key={interval} value={interval}>UTC {interval}</option>)}</select></Field>}
  </>;
}
