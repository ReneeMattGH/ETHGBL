"use client";

import * as React from "react";
import { Area, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_COLORS, compressHeatmap, exactValue, shareValue, type ChartData, type ChartPoint, type ChartSeries, type PlotDefinition } from "@/lib/axis/chart-data";
import { allocationTiles, concentrationPoints } from "@/lib/axis/analytical-layout";
import { CategoryMatrix, chartInk, RelationshipFlow } from "./relationship-plots";

const sum = (values: bigint[]) => values.reduce((sum, value) => sum + value, 0n);
const compact = (value: number) => value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
const readable = (value: string) => { const [whole, fraction] = value.split("."); return `${BigInt(whole).toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`; };
type PlotPoint = ChartPoint & { values: number[]; value?: number; color?: string; legendId?: string };
type Props = { data: ChartData; widget: PlotDefinition; hidden: string[]; highlighted: string | null; chartId: string; unit?: string };

function ValueTip({ title, rows, total }: { title: string; rows: { label: string; value: string; color: string; share?: number }[]; total?: string }) {
  return <div className="axis-chart-tooltip"><strong>{title}</strong><div>{rows.map(row => <div key={row.label}><span><i style={{ background: row.color }} />{row.label}</span><b>{readable(row.value)}{row.share !== undefined && <small>{row.share.toFixed(2)}%</small>}</b></div>)}</div>{total && <footer><span>Visible total</span><b>{readable(total)}</b></footer>}</div>;
}
function TemporalTip({ active, payload, series, visible, percentage }: { active?: boolean; payload?: readonly { payload?: PlotPoint }[]; series: ChartSeries[]; visible: number[]; percentage: boolean }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const denominator = sum(visible.map(index => point.raw[index] ?? 0n)), sameUnit = visible.every(index => series[index].decimals === series[visible[0]].decimals);
  const indices = [...visible].sort((a, b) => point.raw[a] > point.raw[b] ? -1 : point.raw[a] === point.raw[b] ? a - b : 1);
  return <ValueTip title={point.fullLabel} rows={indices.map(index => ({ label: series[index].label, value: exactValue(point.raw[index] ?? 0n, series[index].decimals), color: series[index].color, ...((percentage || visible.length > 1) && sameUnit ? { share: shareValue(point.raw[index] ?? 0n, denominator) } : {}) }))} total={sameUnit && visible.length > 1 ? exactValue(denominator, series[visible[0]].decimals) : undefined} />;
}

function AllocationMosaic({ points, series, highlighted }: { points: PlotPoint[]; series: ChartSeries; highlighted: string | null }) {
  const [hovered, setHovered] = React.useState<ChartPoint | null>(null);
  const [focused, setFocused] = React.useState<ChartPoint | null>(null);
  const active = focused ?? hovered;
  const root = React.useRef<HTMLDivElement>(null), [width, setWidth] = React.useState(900);
  React.useEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => { const next = Math.round(element.getBoundingClientRect().width); if (next > 0) setWidth(next); };
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const tiles = allocationTiles(points, width, 330), total = sum(points.map(point => point.raw[0]));
  if (!total) return <div className="axis-empty">No non-zero values to allocate.</div>;
  return <div ref={root} className="axis-mosaic axis-chart"><svg viewBox={`0 0 ${width} 330`} role="img" aria-label="Allocation treemap with exact category shares">
    {tiles.map(tile => { const original = tile.point as PlotPoint, color = original.color!, label = tile.point.name.length > Math.floor(tile.width / 9) ? tile.point.name.slice(0, Math.max(3, Math.floor(tile.width / 9) - 2)) + "…" : tile.point.name; return <g key={tile.point.fullLabel} tabIndex={0} role="button" aria-label={`${tile.point.fullLabel}: ${exactValue(tile.point.raw[0], series.decimals)}, ${shareValue(tile.point.raw[0], total).toFixed(2)}%`} onMouseEnter={() => setHovered(tile.point)} onMouseLeave={() => setHovered(null)} onFocus={() => setFocused(tile.point)} onBlur={() => setFocused(null)} opacity={highlighted && highlighted !== original.legendId ? .35 : 1}>
      <rect x={tile.x + 2} y={tile.y + 2} width={Math.max(0, tile.width - 4)} height={Math.max(0, tile.height - 4)} fill={color} stroke={active === tile.point ? "#000" : "#fff"} strokeWidth={active === tile.point ? 3 : 2} rx={6} />
      {tile.width > 90 && tile.height > 74 && <><text x={tile.x + 17} y={tile.y + 32} fontSize={16} fill={chartInk(color)} fontWeight={600}>{label}</text><text x={tile.x + 17} y={tile.y + 59} fontSize={21} fill={chartInk(color)} fontWeight={550}>{compact(Number(exactValue(tile.point.raw[0], series.decimals)))}</text>{tile.height > 130 && <><text x={tile.x + 17} y={tile.y + tile.height - 38} fontSize={Math.min(48, tile.width / 4.7)} letterSpacing={-1.5} fill={chartInk(color)} fontWeight={650}>{shareValue(tile.point.raw[0], total).toFixed(1)}%</text><text x={tile.x + 19} y={tile.y + tile.height - 17} fontSize={13} fill={chartInk(color)}>of visible allocation</text></>}</>}
      <title>{`${tile.point.fullLabel}: ${exactValue(tile.point.raw[0], series.decimals)}`}</title>
    </g>; })}
  </svg>{active && <div className="axis-plot-tip"><ValueTip title={active.fullLabel} rows={[{ label: series.label, value: exactValue(active.raw[0], series.decimals), color: (active as PlotPoint).color ?? series.color, share: shareValue(active.raw[0], total) }]} /></div>}</div>;
}

function ConcentrationPlot({ points, series }: { points: ChartPoint[]; series: ChartSeries }) {
  const rows = concentrationPoints(points), height = Math.max(260, rows.length * 35 + 75), max = rows[0]?.point.raw[0] ?? 0n;
  const [hovered, setHovered] = React.useState<typeof rows[number] | null>(null);
  const [focused, setFocused] = React.useState<typeof rows[number] | null>(null);
  const active = focused ?? hovered;
  const curve = rows.map((row, index) => `${660 + shareValue(row.cumulative, row.total) * 2},${66 + index * 35}`).join(" ");
  return <div className="axis-ranking axis-chart" style={{ height }}><svg viewBox={`0 0 900 ${height}`} role="img" aria-label="Ranked contribution and cumulative concentration">
    <text x={14} y={25} fontSize={14} fontWeight={550} fill="#000">Ranked contribution</text><text x={660} y={25} fontSize={14} fontWeight={550} fill="#000">Cumulative share</text>
    <text x={660} y={45} fontSize={12} fill="#000">0%</text><text x={860} y={45} fontSize={12} textAnchor="end" fill="#000">100%</text>
    <path d={`M660 49 L${curve.replaceAll(" ", " L")} L660 ${66 + Math.max(0, rows.length - 1) * 35} Z`} fill={CHART_COLORS[0]} fillOpacity={.3} />
    <polyline points={curve} fill="none" stroke={CHART_COLORS[0]} strokeWidth={2.8} />
    {rows.map((row, index) => { const y = 66 + index * 35, ratio = max ? Number(row.point.raw[0]) / Number(max) : 0; return <g key={row.point.fullLabel} role="button" tabIndex={0} aria-label={`${row.point.fullLabel}: ${exactValue(row.point.raw[0], series.decimals)}; cumulative ${shareValue(row.cumulative, row.total).toFixed(2)}%`} onMouseEnter={() => setHovered(row)} onMouseLeave={() => setHovered(null)} onFocus={() => setFocused(row)} onBlur={() => setFocused(null)}>
      <line x1={12} y1={y + 17} x2={875} y2={y + 17} stroke="#edf0f5" /><text x={14} y={y + 4} fontSize={12} fill="#000">{String(index + 1).padStart(2, "0")}</text><text x={42} y={y + 4} fontSize={13} fill="#000">{row.point.name.length > 25 ? row.point.name.slice(0, 23) + "…" : row.point.name}</text>
      <line x1={280} y1={y} x2={480} y2={y} stroke="#e7ecf5" strokeWidth={2} /><circle cx={280 + ratio * 200} cy={y} r={5} fill={(row.point as PlotPoint).color ?? series.color} stroke="#fff" strokeWidth={1.5} />
      <text x={515} y={y + 4} fontSize={13} fontWeight={550} fill="#000">{compact(Number(exactValue(row.point.raw[0], series.decimals)))}</text><text x={590} y={y + 4} fontSize={12} textAnchor="end" fill="#000">{shareValue(row.point.raw[0], row.total).toFixed(1)}%</text><circle cx={660 + shareValue(row.cumulative, row.total) * 2} cy={y} r={4.5} fill={CHART_COLORS[0]} stroke="#fff" />
      <title>{`${row.point.fullLabel}: ${exactValue(row.point.raw[0], series.decimals)}`}</title>
    </g>; })}
  </svg>{active && <div className="axis-plot-tip"><ValueTip title={active.point.fullLabel} rows={[{ label: series.label, value: exactValue(active.point.raw[0], series.decimals), color: series.color, share: shareValue(active.point.raw[0], active.total) }]} /></div>}</div>;
}

function ActivityMatrix({ data, visible }: { data: ChartData; visible: number[] }) {
  const [hovered, setHovered] = React.useState<{ point: ChartPoint; index: number } | null>(null);
  const [focused, setFocused] = React.useState<{ point: ChartPoint; index: number } | null>(null);
  const active = focused ?? hovered;
  const points = compressHeatmap(data.points, 64), width = 980, left = 150, plotWidth = 710, rowHeight = 43;
  const max = Math.max(0, ...points.flatMap(point => visible.map(index => Number(point.raw[index]))));
  return <div className="axis-heatmap"><svg viewBox={`0 0 ${width} ${Math.max(180, visible.length * rowHeight + 80)}`} role="img" aria-label="Activity intensity and composition matrix">
    <text x={width - 12} y={16} textAnchor="end" fontSize={12} fill="#000">Total</text>
    {visible.map((index, row) => <g key={data.series[index].id}><text x={left - 14} y={row * rowHeight + 47} textAnchor="end" fill="#000" fontSize={13}>{data.series[index].label}</text>{points.map((point, column) => { const value = Number(point.raw[index]); return <rect key={column} x={left + column * plotWidth / points.length} y={row * rowHeight + 24} width={Math.max(1, plotWidth / points.length - 3)} height={33} rx={3} fill={value ? data.series[index].color : "#f0f2f6"} fillOpacity={value ? .7 + .3 * Math.sqrt(value / max) : 1} tabIndex={0} role="button" aria-label={`${point.fullLabel}, ${data.series[index].label}: ${exactValue(point.raw[index], data.series[index].decimals)}`} onMouseEnter={() => setHovered({ point, index })} onMouseLeave={() => setHovered(null)} onFocus={() => setFocused({ point, index })} onBlur={() => setFocused(null)}><title>{`${point.fullLabel}: ${exactValue(point.raw[index], data.series[index].decimals)}`}</title></rect>; })}<text x={width - 12} y={row * rowHeight + 47} textAnchor="end" fontSize={13} fill="#000">{compact(Number(exactValue(sum(data.points.map(point => point.raw[index])), data.series[index].decimals)))}</text></g>)}
    {[0, Math.floor((points.length - 1) / 2), points.length - 1].filter((value, index, all) => all.indexOf(value) === index).map(index => <text key={index} x={left + (index + .5) * plotWidth / points.length} y={visible.length * rowHeight + 52} textAnchor={index === points.length - 1 ? "end" : index === 0 ? "start" : "middle"} fill="#000" fontSize={12}>{points[index]?.name}</text>)}
  </svg>{active && <div className="axis-heatmap-tip" role="status"><b>{active.point.fullLabel}</b><span>{data.series[active.index].label}: {readable(exactValue(active.point.raw[active.index], data.series[active.index].decimals))}</span></div>}{points.length < data.points.length && <p className="axis-chart-footnote">Adjacent observations are combined; totals are preserved.</p>}</div>;
}

export function AdvancedPlot({ data, widget, hidden, highlighted, chartId, unit }: Props) {
  const visible = data.series.map((_, index) => index).filter(index => !hidden.includes(data.series[index].id));
  const percentage = widget.kind === "share-area", combo = widget.kind === "combo";
  const rows: PlotPoint[] = data.points.map((point, pointIndex) => { const denominator = sum(visible.map(index => point.raw[index] ?? 0n)); return { ...point, color: CHART_COLORS[pointIndex % CHART_COLORS.length], legendId: `p${pointIndex}`, values: point.raw.map((raw, index) => percentage ? shareValue(raw, denominator) : Number(exactValue(raw, data.series[index].decimals))) }; });
  if (!rows.length) return <div className="axis-empty">No matching records to chart.</div>;
  const pointView = ["donut", "treemap", "ranked"].includes(widget.kind);
  const shownPoints = rows.filter((_, index) => !hidden.includes(`p${index}`));
  if (pointView && !shownPoints.length || !pointView && !visible.length) return <div className="axis-empty">All series are hidden. Choose All to restore them.</div>;
  if (widget.kind === "treemap") return <AllocationMosaic points={shownPoints} series={data.series[0]} highlighted={highlighted} />;
  if (widget.kind === "ranked") return <ConcentrationPlot points={shownPoints} series={data.series[0]} />;
  if (widget.kind === "heatmap") return <ActivityMatrix data={data} visible={visible} />;
  if (widget.kind === "flow") return <RelationshipFlow data={data} visible={visible} highlighted={highlighted} chartId={chartId} />;
  if (widget.kind === "matrix") return <CategoryMatrix data={data} visible={visible} />;
  // A single observed bucket has no trend: show its actual category composition.
  if (widget.kind === "donut" || rows.length === 1 && !combo) {
    const slices: PlotPoint[] = widget.kind === "donut" ? rows.map((point, index) => ({ ...point, value: point.values[0], color: CHART_COLORS[index % CHART_COLORS.length], legendId: `p${index}` })).filter(point => !hidden.includes(point.legendId!)) : visible.map(index => ({ name: data.series[index].label, fullLabel: data.series[index].label, raw: [rows[0].raw[index]], values: [Number(exactValue(rows[0].raw[index], data.series[index].decimals))], value: Number(exactValue(rows[0].raw[index], data.series[index].decimals)), color: data.series[index].color, legendId: data.series[index].id }));
    const total = sum(slices.map(point => point.raw[0]));
    if (!total) return <div className="axis-empty">No non-zero values in the visible groups.</div>;
    return <div className="axis-chart axis-chart-donut" role="group" aria-label={widget.kind === "donut" ? "Category composition" : "Composition of the observed interval"}><ResponsiveContainer width="100%" height="100%"><PieChart accessibilityLayer><Pie data={slices} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="88%" paddingAngle={2} labelLine={false} label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => { if ((percent ?? 0) < .065) return null; const radius = (Number(innerRadius) + Number(outerRadius)) / 2, angle = -Number(midAngle) * Math.PI / 180; return <text x={Number(cx) + radius * Math.cos(angle)} y={Number(cy) + radius * Math.sin(angle)} textAnchor="middle" dominantBaseline="central" fill={chartInk(slices[index].color!)} fontSize={15} fontWeight={650}>{shareValue(slices[index].raw[0], total).toFixed(1)}%</text>; }} stroke="#fff" strokeWidth={2} isAnimationActive={false}>{slices.map(point => <Cell key={point.fullLabel} fill={point.color} opacity={highlighted && highlighted !== point.legendId ? .3 : 1} />)}</Pie><Tooltip content={({ active, payload }) => { const point = payload?.[0]?.payload as PlotPoint | undefined; return active && point ? <ValueTip title={point.fullLabel} rows={[{ label: unit ?? (data.series[0].decimals ? "USDC" : "Transfers"), value: exactValue(point.raw[0], data.series[0].decimals), color: point.color!, share: shareValue(point.raw[0], total) }]} /> : null; }} /><text x="50%" y="47%" textAnchor="middle" fill="#000" fontSize={34} fontWeight={650}>{compact(Number(exactValue(total, data.series[0].decimals)))}</text><text x="50%" y="56%" textAnchor="middle" fill="#000" fontSize={14}>{unit ?? (data.series[0].decimals ? "USDC" : "Transfers")}</text></PieChart></ResponsiveContainer></div>;
  }
  const tick = { fill: "#000", fontSize: 13 };
  return <div className="axis-chart" role="group" aria-label={`${widget.title}: ${rows.length} observed groups`}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={rows} accessibilityLayer margin={{ left: 0, right: combo ? 0 : 16, top: 12, bottom: 12 }}>
    <defs>{data.series.map(series => <linearGradient key={series.id} id={`${chartId}-${series.id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={series.color} stopOpacity={1} /><stop offset="100%" stopColor={series.color} stopOpacity={1} /></linearGradient>)}</defs>
    <CartesianGrid stroke="#e7eaf0" vertical={false} strokeDasharray="3 4" /><XAxis dataKey="name" tick={tick} tickLine={false} axisLine={{ stroke: "#dce2eb" }} minTickGap={40} tickMargin={10} tickFormatter={value => widget.grouping === "block" ? `#${String(value).replace(/^#/, "").slice(-6)}` : String(value)} />
    <YAxis width={58} tick={tick} tickLine={false} axisLine={false} domain={percentage ? [0, 100] : [0, "auto"]} tickFormatter={value => percentage ? `${value}%` : compact(Number(value))} />
    {combo && <YAxis yAxisId="count" orientation="right" width={44} tick={tick} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={value => compact(Number(value))} />}
    <Tooltip content={<TemporalTip series={data.series} visible={visible} percentage={percentage} />} cursor={{ stroke: "#607291", strokeDasharray: "4 3" }} wrapperStyle={{ zIndex: 20, outline: "none" }} isAnimationActive={false} />
    {visible.map(index => { const series = data.series[index], dataKey = (point: PlotPoint) => point.values[index], opacity = highlighted && highlighted !== series.id ? .25 : 1;
      return combo && index === 1 ? <Line key={series.id} yAxisId="count" dataKey={dataKey} name={series.label} stroke={series.color} strokeWidth={2.2} dot={false} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} opacity={opacity} type="linear" isAnimationActive={false} /> : <Area key={series.id} dataKey={dataKey} name={series.label} stackId={combo ? undefined : "composition"} stroke={series.color} strokeWidth={.9} fill={`url(#${chartId}-${series.id})`} fillOpacity={opacity} type="linear" activeDot={{ r: 4, stroke: "#fff", strokeWidth: 1.5 }} isAnimationActive={false} />;
    })}
    {percentage && <ReferenceLine y={50} stroke="#96a0b2" strokeDasharray="3 4" />}
  </ComposedChart></ResponsiveContainer></div>;
}
