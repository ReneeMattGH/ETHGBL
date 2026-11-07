"use client";

import * as React from "react";
import { relationshipFlow } from "@/lib/axis/analytical-layout";
import { CHART_COLORS, exactValue, shareValue, type ChartData } from "@/lib/axis/chart-data";

const sum = (values: bigint[]) => values.reduce((a, b) => a + b, 0n);
const compact = (value: bigint, decimals: number) => Number(exactValue(value, decimals)).toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 });
const shorten = (label: string, max = 19) => label.length <= max ? label : label.startsWith("0x") && max >= 14 ? `${label.slice(0, 8)}…${label.slice(-5)}` : `${label.slice(0, max - 1)}…`;

export function chartInk(color: string, opacity = 1) {
  const rgb = color.slice(1).match(/.{2}/g)!.map(channel => (parseInt(channel, 16) * opacity + 255 * (1 - opacity)) / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 < .179 ? "#fff" : "#000";
}

function RelationshipTip({ source, target, raw, total, color, decimals }: { source: string; target: string; raw: bigint; total: bigint; color: string; decimals: number }) {
  return <div className="axis-chart-tooltip"><strong>{source} → {target}</strong><div><div><span><i style={{ background: color }} />Records</span><b>{exactValue(raw, decimals)}<small>{shareValue(raw, total).toFixed(2)}% of visible total</small></b></div></div></div>;
}

export function RelationshipFlow({ data, visible, highlighted, chartId }: { data: ChartData; visible: number[]; highlighted: string | null; chartId: string }) {
  const root = React.useRef<HTMLDivElement>(null), [width, setWidth] = React.useState(900);
  React.useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => { const next = Math.round(entries[0].contentRect.width); if (next) setWidth(next); });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  const vertical = width < 560 && Math.max(data.points.length, visible.length) <= 3;
  const height = Math.max(370, Math.max(data.points.length, visible.length) * 43 + 70), flow = relationshipFlow(data, visible, vertical ? Math.max(180, width) : height);
  const [active, setActive] = React.useState<number | null>(null);
  const selected = active === null ? undefined : flow.links[active];
  if (!flow.total) return <div ref={root} className="axis-empty">No relationships in the visible records.</div>;
  return <div ref={root} className={`axis-flow ${vertical ? "axis-flow-vertical" : ""}`} style={{ height: vertical ? 540 : height }}><svg viewBox={vertical ? `0 0 ${Math.max(180, width)} 540` : `0 0 900 ${height}`} role="img" aria-label={`${data.dimensions?.source ?? "Source"} to ${data.dimensions?.target ?? "Category"} relationship flow`}>
    <defs>{flow.links.map((link, index) => <linearGradient key={index} id={`${chartId}-flow-${index}`} x1="0%" x2="100%" y1="0%" y2="0%"><stop offset="0%" stopColor={CHART_COLORS[link.source.index % CHART_COLORS.length]} /><stop offset="100%" stopColor={data.series[link.target.index].color} /></linearGradient>)}</defs>
    <text x={vertical ? 8 : 178} y={22} textAnchor={vertical ? "start" : "end"} fontSize={14} fontWeight={650} fill="#000">{data.dimensions?.source ?? "Source"}</text><text x={vertical ? 8 : 728} y={vertical ? 532 : 22} fontSize={14} fontWeight={650} fill="#000">{data.dimensions?.target ?? "Category"}</text>
    <g transform={vertical ? "matrix(0 .66 1 0 0 -23)" : undefined}>
    {flow.links.map((link, index) => <path key={`${link.source.index}-${link.target.index}`} d={link.path} fill={`url(#${chartId}-flow-${index})`} fillOpacity={active !== null ? active === index ? 1 : .16 : highlighted && highlighted !== data.series[link.target.index].id ? .16 : 1} stroke="#fff" strokeWidth={1.5} role="button" tabIndex={0} aria-label={`${link.source.label} to ${link.target.label}: ${exactValue(link.raw, data.series[link.target.index].decimals)}, ${shareValue(link.raw, flow.total).toFixed(2)}%`} onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(index)} onBlur={() => setActive(null)}><title>{`${link.source.label} → ${link.target.label}: ${link.raw}`}</title></path>)}
    {flow.sources.map(node => <rect key={node.index} x={182} y={node.y} width={8} height={node.height} rx={2} fill={CHART_COLORS[node.index % CHART_COLORS.length]} />)}
    {flow.targets.map(node => <rect key={node.index} x={710} y={node.y} width={8} height={node.height} rx={2} fill={data.series[node.index].color} />)}
    </g>
    {flow.sources.map(node => <g key={node.index}><text x={vertical ? node.y + node.height / 2 : 166} y={vertical ? 71 : node.y + node.height / 2 - 5} textAnchor={vertical ? "middle" : "end"} fill="#000" fontSize={vertical ? 12 : 15} fontWeight={600}>{shorten(node.label, vertical ? Math.max(4, Math.floor(node.height / 6)) : 19)}<title>{node.label}</title></text><text x={vertical ? node.y + node.height / 2 : 166} y={vertical ? 90 : node.y + node.height / 2 + 16} textAnchor={vertical ? "middle" : "end"} fill="#000" fontSize={13}>{compact(node.raw, data.series[0].decimals)}{!vertical && ` · ${shareValue(node.raw, flow.total).toFixed(1)}%`}</text></g>)}
    {flow.targets.map(node => <g key={node.index}><text x={vertical ? node.y + node.height / 2 : 734} y={vertical ? 475 : node.y + node.height / 2 - 5} textAnchor={vertical ? "middle" : "start"} fill="#000" fontSize={vertical ? 12 : 15} fontWeight={600}>{shorten(node.label, vertical ? Math.max(4, Math.floor(node.height / 6)) : 19)}<title>{node.label}</title></text><text x={vertical ? node.y + node.height / 2 : 734} y={vertical ? 494 : node.y + node.height / 2 + 16} textAnchor={vertical ? "middle" : "start"} fill="#000" fontSize={13}>{compact(node.raw, data.series[node.index].decimals)}{!vertical && ` · ${shareValue(node.raw, flow.total).toFixed(1)}%`}</text></g>)}
  </svg>{selected && <div className="axis-plot-tip"><RelationshipTip source={selected.source.label} target={selected.target.label} raw={selected.raw} total={flow.total} color={data.series[selected.target.index].color} decimals={data.series[selected.target.index].decimals} /></div>}</div>;
}

export function CategoryMatrix({ data, visible }: { data: ChartData; visible: number[] }) {
  const [active, setActive] = React.useState<{ point: number; series: number } | null>(null);
  const columns = data.points, left = 178, top = 82, cellWidth = Math.max(90, 650 / Math.max(1, columns.length)), rowHeight = 70, width = left + columns.length * cellWidth + 90, height = top + visible.length * rowHeight + 60;
  const max = Math.max(1, ...columns.flatMap(point => visible.map(index => Number(point.raw[index] ?? 0n))));
  const totals = columns.map(point => sum(visible.map(index => point.raw[index] ?? 0n))), total = sum(totals);
  return <div className="axis-heatmap axis-category-matrix"><svg style={{ minWidth: Math.max(760, width) }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${data.dimensions?.source ?? "Categories"} by ${data.dimensions?.target ?? "series"} relationship matrix`}>
    <text x={left} y={18} fill="#000" fontSize={14} fontWeight={650}>{data.dimensions?.source ?? "Categories"}</text><text x={width - 16} y={top - 16} textAnchor="end" fill="#000" fontSize={13}>Total</text>
    {columns.map((point, column) => <text key={point.fullLabel} x={left + (column + .5) * cellWidth} y={top - 18} textAnchor="middle" fill="#000" fontSize={13} fontWeight={550}>{shorten(point.name, Math.floor(cellWidth / 7))}<title>{point.fullLabel}</title></text>)}
    {visible.map((seriesIndex, row) => { const series = data.series[seriesIndex]; return <g key={series.id}><rect x={0} y={top + row * rowHeight + 24} width={7} height={18} rx={2} fill={series.color} /><text x={left - 14} y={top + row * rowHeight + 38} textAnchor="end" fontSize={14} fontWeight={550} fill="#000">{shorten(series.label)}<title>{series.label}</title></text>{columns.map((point, column) => { const value = point.raw[seriesIndex] ?? 0n, alpha = .72 + .28 * Math.sqrt(Number(value) / max), ink = chartInk(series.color, alpha); return <g key={column} tabIndex={0} role="button" aria-label={`${point.fullLabel}, ${series.label}: ${exactValue(value, series.decimals)}, ${shareValue(value, totals[column]).toFixed(2)}% of category`} onFocus={() => setActive({ point: column, series: seriesIndex })} onBlur={() => setActive(null)} onMouseEnter={() => setActive({ point: column, series: seriesIndex })} onMouseLeave={() => setActive(null)}><rect x={left + column * cellWidth} y={top + row * rowHeight} width={cellWidth - 5} height={rowHeight - 5} rx={5} fill={value ? series.color : "#f1f3f8"} fillOpacity={value ? alpha : 1} stroke={active?.point === column && active.series === seriesIndex ? "#000" : "#fff"} strokeWidth={2} /><text x={left + (column + .5) * cellWidth - 2} y={top + row * rowHeight + 29} textAnchor="middle" fill={value ? ink : "#000"} fontSize={20} fontWeight={650}>{value ? compact(value, series.decimals) : "—"}</text>{value > 0n && <text x={left + (column + .5) * cellWidth - 2} y={top + row * rowHeight + 49} textAnchor="middle" fill={ink} fontSize={12}>{shareValue(value, totals[column]).toFixed(1)}%</text>}<title>{`${point.fullLabel} · ${series.label}: ${exactValue(value, series.decimals)}`}</title></g>; })}<text x={width - 16} y={top + row * rowHeight + 38} textAnchor="end" fill="#000" fontSize={15} fontWeight={650}>{compact(sum(columns.map(point => point.raw[seriesIndex] ?? 0n)), series.decimals)}</text></g>; })}
    <text x={left - 14} y={height - 24} textAnchor="end" fill="#000" fontSize={13}>Total</text>{totals.map((value, index) => <text key={index} x={left + (index + .5) * cellWidth} y={height - 24} textAnchor="middle" fontSize={15} fontWeight={650} fill="#000">{compact(value, data.series[0].decimals)}</text>)}<text x={width - 16} y={height - 24} textAnchor="end" fontSize={15} fontWeight={650} fill="#000">{compact(total, data.series[0].decimals)}</text>
  </svg>{active && <div className="axis-plot-tip"><RelationshipTip source={columns[active.point].fullLabel} target={data.series[active.series].label} raw={columns[active.point].raw[active.series]} total={total} color={data.series[active.series].color} decimals={data.series[active.series].decimals} /></div>}</div>;
}
