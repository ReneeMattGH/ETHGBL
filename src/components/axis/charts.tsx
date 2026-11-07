"use client";

import * as React from "react";
import { AdvancedPlot } from "./advanced-plots";
import { Download, Expand, Table2, X } from "lucide-react";
import type { Analytics, AxisWidget } from "@/lib/axis/model";
import { analyticalWidget } from "@/lib/axis/chart-config";
import type { CatalogInsightChart } from "@/lib/axis/catalog-insight-model";
import { buildChartData, chartCsv, CHART_COLORS, compressHeatmap, exactValue, shareValue, type ChartData, type ChartPoint, type ChartSeries, type PlotDefinition } from "@/lib/axis/chart-data";

const compact = (value: number) => value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
const total = (values: bigint[]) => values.reduce((a, b) => a + b, 0n);
const display = (value: string) => { const [whole, fraction] = value.split("."); return `${BigInt(whole).toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`; };
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function AnalyticsChart({ analytics, widget: definition }: { analytics: Analytics; widget: AxisWidget }) {
  const widget = analyticalWidget(definition);
  const data = React.useMemo(() => buildChartData(analytics, widget), [analytics, widget]);
  const identity = `${widget.kind}:${widget.grouping}:${widget.metric}:${widget.interval ?? "day"}`;
  return <ChartInteraction key={identity} data={data} widget={widget} />;
}
export function CatalogDataChart({ chart }: { chart: CatalogInsightChart }) {
  const data: ChartData = { series: (chart.series ?? [{ id: "value", label: chart.unit }]).map((series, index) => ({ ...series, color: CHART_COLORS[index % CHART_COLORS.length], decimals: chart.decimals })), points: chart.points.map(point => ({ name: point.label.startsWith("0x") ? `${point.label.slice(0, 8)}…${point.label.slice(-4)}` : point.label.startsWith("Block ") ? `#${point.label.split(" ")[1]}` : point.label, fullLabel: point.label, raw: (point.values ?? [point.value]).map(value => BigInt(value)) })) };
  data.dimensions = chart.dimensions;
  const temporal = ["line", "stacked-area", "share-area", "heatmap"].includes(chart.kind);
  const base = { id: chart.title, title: chart.title, metric: chart.decimals ? "amount" as const : "transfers" as const, grouping: temporal ? "time" as const : "distribution" as const, width: 2 as const, query: { datasetKey: "", filters: {} } };
  const widget: PlotDefinition = chart.kind === "flow" || chart.kind === "matrix" ? { ...base, kind: chart.kind } : analyticalWidget({ ...base, kind: chart.kind });
  return <ChartInteraction data={data} widget={widget} unit={chart.unit} sourceLabel="Arkiv query · verified Polygon records" />;
}
function ChartInteraction({ data, widget, unit, sourceLabel = "Arkiv query · verified Polygon USDC data" }: { data: ChartData; widget: PlotDefinition; unit?: string; sourceLabel?: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const [hidden, setHidden] = React.useState<string[]>([]), [highlighted, setHighlighted] = React.useState<string | null>(null), [table, setTable] = React.useState(false), [message, setMessage] = React.useState<string | null>(null);
  const root = React.useRef<HTMLDivElement>(null), dialog = React.useRef<HTMLDialogElement>(null), id = React.useId().replaceAll(":", "");
  React.useEffect(() => { if (expanded) dialog.current?.showModal(); }, [expanded]);
  const selected = data.points, pointView = ["donut", "treemap", "ranked"].includes(widget.kind);
  const choices = pointView ? data.points.map((point, index) => ({ id: `p${index}`, label: point.name, color: CHART_COLORS[index % CHART_COLORS.length], raw: point.raw[0], decimals: data.series[0].decimals })) : data.series.map((series, index) => ({ ...series, raw: total(data.points.map(point => point.raw[index] ?? 0n)) }));
  if (choices.every(choice => choice.decimals === choices[0]?.decimals)) choices.sort((a, b) => a.raw > b.raw ? -1 : a.raw === b.raw ? a.label.localeCompare(b.label) : 1);
  const visibleChoices = choices.filter(choice => !hidden.includes(choice.id));
  const sameUnit = visibleChoices.every(choice => choice.decimals === visibleChoices[0]?.decimals);
  const primaryDecimals = visibleChoices[0]?.decimals ?? data.series[0]?.decimals ?? 0;
  const summaryUnit = unit ?? (primaryDecimals ? "USDC" : "transfers");
  const visibleTotal = total(visibleChoices.filter(choice => sameUnit || choice.id === data.series[0].id).map(choice => choice.raw));
  const largest = [...visibleChoices].sort((a, b) => a.raw > b.raw ? -1 : a.raw === b.raw ? a.label.localeCompare(b.label) : 1)[0];
  const observationTotals = data.points.map(point => total(data.series.map((series, index) => hidden.includes(series.id) || series.decimals !== primaryDecimals ? 0n : point.raw[index] ?? 0n)));
  const peak = observationTotals.reduce((best, value, index) => value > observationTotals[best] ? index : best, 0);
  const toggle = (key: string) => setHidden(value => value.includes(key) ? value.filter(item => item !== key) : [...value, key]);
  const exportCsv = () => { download(new Blob([chartCsv(selected, data.series)], { type: "text/csv;charset=utf-8" }), "axis-chart-data.csv"); setMessage("Exported exact values for all chart groups, including hidden series."); };
  const exportGraphic = async (png: boolean) => {
    try {
      const source = (dialog.current?.open ? dialog.current : root.current)?.querySelector<SVGSVGElement>(".axis-chart svg.recharts-surface, .axis-heatmap > svg, .axis-mosaic > svg, .axis-ranking > svg, .axis-flow > svg");
      if (!source) throw new Error("Switch to the chart view to export a graphic.");
      const svg = source.cloneNode(true) as SVGSVGElement, bounds = source.getBoundingClientRect(), width = source.viewBox.baseVal.width || bounds.width, height = source.viewBox.baseVal.height || bounds.height;
      const originals = [...source.querySelectorAll("*")], clones = [...svg.querySelectorAll("*")];
      originals.forEach((element, index) => { const style = getComputedStyle(element); for (const property of ["font-family", "font-size", "font-weight", "fill", "stroke", "stroke-width", "fill-opacity", "opacity", "paint-order"]) { const value = style.getPropertyValue(property).replace(/url\(["']?[^#)]*#([^\s)"']+)["']?\)/g, "url(#$1)"); if (value) (clones[index] as SVGElement).style.setProperty(property, value); } });
      let legendX = 12, legendY = height + 46;
      for (const choice of choices.filter(choice => !hidden.includes(choice.id))) {
        const itemWidth = Math.min(width - 24, choice.label.length * 7 + 29);
        if (legendX + itemWidth > width - 12) { legendX = 12; legendY += 21; }
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "rect"); dot.setAttribute("x", String(legendX)); dot.setAttribute("y", String(legendY - 8)); dot.setAttribute("width", "8"); dot.setAttribute("height", "8"); dot.setAttribute("fill", choice.color); svg.append(dot);
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text"); text.setAttribute("x", String(legendX + 14)); text.setAttribute("y", String(legendY)); text.setAttribute("fill", "#000"); text.setAttribute("font-size", "11"); text.textContent = choice.label; svg.append(text); legendX += itemWidth;
      }
      const exportHeight = legendY + 53;
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg"); svg.setAttribute("width", String(width)); svg.setAttribute("height", String(exportHeight)); svg.setAttribute("viewBox", `0 -35 ${width} ${exportHeight}`); svg.setAttribute("font-family", "Arial, sans-serif");
      const background = document.createElementNS("http://www.w3.org/2000/svg", "rect"); background.setAttribute("x", "0"); background.setAttribute("y", "-35"); background.setAttribute("width", String(width)); background.setAttribute("height", String(exportHeight)); background.setAttribute("fill", "#fff"); svg.prepend(background);
      for (const [text, y] of [[widget.title || "AXIS analytics", -12], [`${sourceLabel} · ${selected.length} visible groups`, height + 24]] as const) { const node = document.createElementNS("http://www.w3.org/2000/svg", "text"); node.setAttribute("x", "12"); node.setAttribute("y", String(y)); node.setAttribute("fill", "#000"); node.setAttribute("font-size", "12"); node.textContent = text; svg.append(node); }
      const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" });
      if (!png) download(blob, "axis-chart.svg");
      else { const url = URL.createObjectURL(blob); try { const img = new Image(); img.src = url; await img.decode(); const canvas = document.createElement("canvas"); canvas.width = Math.ceil(width * 2); canvas.height = Math.ceil(exportHeight * 2); const context = canvas.getContext("2d"); if (!context) throw new Error("Image export is unavailable."); context.drawImage(img, 0, 0, canvas.width, canvas.height); const output = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png")); if (!output) throw new Error("Image export failed."); download(output, "axis-chart.png"); } finally { URL.revokeObjectURL(url); } }
      setMessage(`Downloaded ${png ? "PNG" : "SVG"} of the current chart.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Chart export failed."); }
  };
  const render = (expanded = false) => <>
    <div className="axis-chart-toolbar"><div className="axis-chart-primary"><span>{hidden.length ? "Visible" : "Total"} {summaryUnit}</span><strong title={display(exactValue(visibleTotal, primaryDecimals))}>{compact(Number(exactValue(visibleTotal, primaryDecimals)))}</strong></div><div className="axis-chart-tools">
      <button aria-pressed={table} onClick={() => setTable(value => !value)} title="Show exact values"><Table2 size={15} />{table ? "Chart" : "Data"}</button>
      <details className="axis-chart-export"><summary><Download size={15} /><span>Export</span></summary><div><button onClick={exportCsv}>Download chart CSV</button><button onClick={() => void exportGraphic(false)}>Download SVG</button><button onClick={() => void exportGraphic(true)}>Download PNG</button></div></details>
      {!expanded && <button aria-label="Expand chart" title="Expand chart" onClick={() => setExpanded(true)}><Expand size={15} /></button>}
    </div></div>
    {data.note && <details className="axis-chart-method"><summary>Calculation details</summary><p>{data.note}</p></details>}
    <div className={`axis-chart-analysis ${table ? "showing-data" : ""}`}>
      <div className="axis-chart-canvas">{table ? <div className="axis-table-wrap axis-chart-values"><table aria-label="Exact chart values"><thead><tr><th>Group</th>{data.series.map(series => <th key={series.id}>{series.label}{series.decimals ? " (USDC)" : ""}</th>)}</tr></thead><tbody>{selected.map(point => <tr key={point.fullLabel}><td>{point.fullLabel}</td>{point.raw.map((raw, index) => <td key={index} className="axis-mono">{exactValue(raw, data.series[index].decimals)}</td>)}</tr>)}</tbody></table></div> : <AdvancedPlot data={data} widget={widget} hidden={hidden} highlighted={highlighted} chartId={`${id}-${expanded ? "full" : "inline"}`} unit={unit} />}</div>
      <aside className="axis-chart-legend" role="group" aria-label="Chart legend"><div className="axis-chart-legend-heading"><span>{pointView ? "Allocation" : "Composition"}</span><button className="axis-chart-legend-all" onClick={() => setHidden([])}>All</button></div>{choices.map(choice => <button key={choice.id} aria-label={choice.label} aria-pressed={!hidden.includes(choice.id)} onClick={() => toggle(choice.id)} onMouseEnter={() => setHighlighted(choice.id)} onMouseLeave={() => setHighlighted(null)}><i style={{ background: choice.color }} /><span>{choice.label}</span><strong title={exactValue(choice.raw, choice.decimals)}>{compact(Number(exactValue(choice.raw, choice.decimals)))}</strong>{sameUnit && <small>{hidden.includes(choice.id) ? "—" : `${shareValue(choice.raw, visibleTotal).toFixed(1)}%`}</small>}</button>)}</aside>
    </div>
    {!!selected.length && <div className="axis-chart-analysis-footer"><span>{selected.length.toLocaleString()} {pointView ? "categories" : data.dimensions ? `${data.dimensions.source.toLowerCase()} groups` : "observed groups"}</span>{largest && sameUnit && <span><i style={{ background: largest.color }} />{largest.label} · {shareValue(largest.raw, visibleTotal).toFixed(1)}%</span>}{!pointView && selected.length > 1 && !data.dimensions && <span>Peak: {compact(Number(exactValue(observationTotals[peak], primaryDecimals)))}</span>}</div>}
    {message && <p className="axis-chart-message" role="status">{message}</p>}
  </>;
  return <div ref={root} className={`axis-analytics kind-${widget.kind}`} data-chart-kind={widget.kind}>{render()}<dialog ref={dialog} className="axis-chart-dialog" aria-labelledby={`${id}-title`} onClose={() => setExpanded(false)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}><header><h2 id={`${id}-title`}>{widget.title || "AXIS analytics"}</h2><button className="axis-icon-button" aria-label="Close expanded chart" onClick={() => dialog.current?.close()}><X size={20} /></button></header>{expanded && render(true)}</dialog></div>;
}
