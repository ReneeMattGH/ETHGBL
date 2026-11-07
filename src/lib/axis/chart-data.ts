import { formatUnits } from "viem";
import type { Analytics, AxisWidget, ChartInterval } from "./model";

export const CHART_COLORS = ["#173bff", "#9500ff", "#ff4a00", "#00d4e8", "#ff007a", "#70e000", "#ffd600", "#00c875", "#ff1744", "#5700ff", "#008fff", "#ff9d00"];
export type ChartSeries = { id: string; label: string; color: string; decimals: number };
export type ChartPoint = { name: string; fullLabel: string; raw: bigint[] };
export type PlotDefinition = Omit<AxisWidget, "kind"> & { kind: AxisWidget["kind"] | "flow" | "matrix" };
export type ChartData = { points: ChartPoint[]; series: ChartSeries[]; note?: string; dimensions?: { source: string; target: string } };
const sum = (values: bigint[]) => values.reduce((a, b) => a + b, 0n);
export function exactValue(raw: bigint, decimals: number) { return formatUnits(raw, decimals); }
export function shareValue(raw: bigint, total: bigint) { return total === 0n ? 0 : Number(raw * 1000000n / total) / 10000; }
function timeBucket(timestamp: string, interval: ChartInterval) {
  const seconds = Number(timestamp), step = { minute: 60, hour: 3600, day: 86400, week: 604800 }[interval];
  const offset = interval === "week" ? 259200 : 0;
  const bucket = Math.floor((seconds + offset) / step) * step - offset;
  const iso = new Date(bucket * 1000).toISOString();
  return { key: String(bucket), name: interval === "minute" || interval === "hour" ? iso.slice(5, 16).replace("T", " ") : iso.slice(0, 10), fullLabel: `${iso.replace("T", " ").slice(0, 19)} UTC${interval === "week" ? " · week starting Monday" : ""}` };
}
export function buildChartData(analytics: Analytics, widget: AxisWidget): ChartData {
  const split = ["stacked", "share", "stacked-area", "share-area", "heatmap"].includes(widget.kind), combo = widget.kind === "combo", amount = widget.metric === "amount";
  const series: ChartSeries[] = split ? analytics.distribution.map((bucket, index) => ({ id: `s${index}`, label: bucket.bucket, color: CHART_COLORS[index % CHART_COLORS.length], decimals: amount ? 6 : 0 })) : combo ? [{ id: "s0", label: "Transferred USDC", color: CHART_COLORS[0], decimals: 6 }, { id: "s1", label: "Transfers", color: CHART_COLORS[1], decimals: 0 }] : [{ id: "s0", label: amount ? "Transferred USDC" : "Transfers", color: CHART_COLORS[1], decimals: amount ? 6 : 0 }];
  const rawOf = (item: { transfers: number; amountRaw: string }) => amount ? BigInt(item.amountRaw) : BigInt(item.transfers);
  let points: ChartPoint[] = [];
  if (widget.grouping === "block" || widget.grouping === "time") {
    const groups = new Map<string, ChartPoint>();
    const compositionByBlock = new Map((analytics.blockComposition ?? []).map(item => [item.blockNumber, item]));
    for (const block of analytics.blockSeries) {
      const label = widget.grouping === "block" ? { key: block.blockNumber, name: `#${block.blockNumber}`, fullLabel: `Block ${block.blockNumber} · ${new Date(Number(block.timestamp) * 1000).toISOString().replace("T", " ").slice(0, 19)} UTC` } : timeBucket(block.timestamp, widget.interval ?? "day");
      const point = groups.get(label.key) ?? { name: label.name, fullLabel: label.fullLabel, raw: series.map(() => 0n) };
      const composition = split ? compositionByBlock.get(block.blockNumber) : undefined;
      const values = split ? series.map((_, index) => composition ? rawOf(composition.buckets[index]) : 0n) : combo ? [BigInt(block.amountRaw), BigInt(block.transfers)] : [rawOf(block)];
      point.raw = point.raw.map((value, index) => value + values[index]); groups.set(label.key, point);
    }
    points = [...groups.values()];
  } else {
    const list = widget.grouping === "distribution" ? analytics.distribution.map(item => ({ ...item, name: item.bucket, fullLabel: item.bucket })) : (widget.grouping === "sender" ? analytics.topSenders : analytics.topRecipients).map(item => ({ ...item, name: `${item.address.slice(0, 6)}…${item.address.slice(-4)}`, fullLabel: item.address }));
    points = list.map(item => ({ name: item.name, fullLabel: item.fullLabel, raw: [rawOf(item)] }));
    if (widget.grouping !== "distribution") {
      const remainder = (amount ? BigInt(analytics.amountRaw) : BigInt(analytics.transfers)) - sum(points.map(item => item.raw[0]));
      if (remainder > 0n) points.push({ name: "Other addresses", fullLabel: "All addresses outside the top 20 by transferred volume", raw: [remainder] });
    }
    if (widget.kind === "horizontal" || widget.kind === "ranked") points.sort((a, b) => a.raw[0] === b.raw[0] ? a.name.localeCompare(b.name) : a.raw[0] > b.raw[0] ? -1 : 1);
  }
  if ((widget.kind === "donut" || widget.kind === "treemap") && points.length > 12) {
    points.sort((a, b) => a.raw[0] === b.raw[0] ? a.name.localeCompare(b.name) : a.raw[0] > b.raw[0] ? -1 : 1);
    points = [...points.slice(0, 11), { name: "Remaining groups", fullLabel: "Combined remaining groups", raw: [sum(points.slice(11).map(point => point.raw[0]))] }];
  }
  return { points, series, ...(split && !analytics.blockComposition ? { note: "Refresh the query to load transfer-size composition." } : widget.grouping === "sender" || widget.grouping === "recipient" ? { note: "The top 20 addresses are selected by transferred volume. Other addresses are combined; totals cover the full query." } : {}) };
}
export function chartCsv(points: ChartPoint[], series: ChartSeries[]) {
  const escape = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
  return [["Group", ...series.map(item => `${item.label} (${item.decimals ? "USDC" : "count"})`)], ...points.map(point => [point.fullLabel, ...point.raw.map((raw, index) => exactValue(raw, series[index].decimals))])].map(row => row.map(escape).join(",")).join("\r\n");
}
export function compressHeatmap(points: ChartPoint[], max = 80): ChartPoint[] {
  const step = Math.max(1, Math.ceil(points.length / max)), result: ChartPoint[] = [];
  for (let index = 0; index < points.length; index += step) {
    const group = points.slice(index, index + step);
    result.push({ name: group.length === 1 ? group[0].name : `${group[0].name}–${group.at(-1)!.name}`, fullLabel: group.length === 1 ? group[0].fullLabel : `${group[0].fullLabel} through ${group.at(-1)!.fullLabel}`, raw: group[0].raw.map((_, column) => sum(group.map(point => point.raw[column]))) });
  }
  return result;
}
