import { CHART_INTERVALS, CHART_KINDS, type AxisWidget } from "./model";

export const GROUP_LABELS: Record<AxisWidget["grouping"], string> = { time: "Time (UTC)", block: "Source block", distribution: "Transfer size", sender: "Senders (top by volume)", recipient: "Recipients (top by volume)" };
export function chartGroupings(kind: AxisWidget["kind"]): AxisWidget["grouping"][] {
  if (["stacked", "share", "stacked-area", "share-area", "heatmap", "combo"].includes(kind)) return ["block", "time"];
  if (["donut", "horizontal", "ranked", "treemap"].includes(kind)) return ["distribution", "sender", "recipient"];
  return ["block", "time", "distribution", "sender", "recipient"];
}
// Saved definitions keep their original meaning while using the analytical renderer.
export function analyticalWidget(widget: AxisWidget): AxisWidget {
  const temporal = widget.grouping === "time" || widget.grouping === "block";
  const kind = ["line", "area", "bar"].includes(widget.kind) ? temporal ? "stacked-area" : "treemap" : widget.kind === "stacked" ? "stacked-area" : widget.kind === "share" ? "share-area" : widget.kind === "horizontal" ? "ranked" : widget.kind;
  return { ...widget, kind };
}
export function changeChartKind(widget: AxisWidget, kind: AxisWidget["kind"]): AxisWidget {
  const groupings = chartGroupings(kind);
  return { ...widget, kind, metric: kind === "metric" ? widget.metric : kind === "combo" ? "amount" : ["transfers", "amount"].includes(widget.metric) ? widget.metric : "transfers", grouping: groupings.includes(widget.grouping) ? widget.grouping : groupings[0] };
}
export function validateVisualization(widget: AxisWidget) {
  if (widget.interval !== undefined && !CHART_INTERVALS.includes(widget.interval)) throw new Error("Invalid chart time interval.");
  if (CHART_KINDS.includes(widget.kind as typeof CHART_KINDS[number])) {
    if (!["transfers", "amount"].includes(widget.metric)) throw new Error("Grouped charts support transfer count and gross amount. Use a metric for exact unique wallets.");
    if (!chartGroupings(widget.kind).includes(widget.grouping)) throw new Error("This visualization requires a compatible grouping.");
  }
}
