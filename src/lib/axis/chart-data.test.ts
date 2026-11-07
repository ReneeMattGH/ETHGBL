import { describe, expect, it } from "vitest";
import { aggregateTransfers, validateDashboard } from "./core";
import { buildChartData, chartCsv, compressHeatmap, exactValue, shareValue } from "./chart-data";
import { changeChartKind } from "./chart-config";
import { CHART_KINDS, USDC, type AxisWidget, type Transfer } from "./model";

const sum = (values: bigint[]) => values.reduce((a, b) => a + b, 0n);
function transfer(value: string, block = 10, timestamp = 1736121600, sender = "0x" + "1".repeat(40)): Transfer {
  return { sourceId: `${block}:${value}:${sender}`, chainId: 137, contract: USDC, blockNumber: String(block), blockHash: "0x" + "a".repeat(64), timestamp: String(timestamp), txHash: "0x" + "b".repeat(64), txIndex: 0, logIndex: 0, sender, recipient: "0x" + "2".repeat(40), amountRaw: value, amount: exactValue(BigInt(value), 6), decimals: 6, contentHash: "0x" + "c".repeat(64) };
}
const widget = (patch: Partial<AxisWidget> = {}): AxisWidget => ({ id: "one", title: "Activity", kind: "stacked", grouping: "block", metric: "amount", width: 2, query: { datasetKey: "0x" + "a".repeat(64), filters: {} }, ...patch });
const analytics = () => aggregateTransfers([transfer("0"), transfer("1"), transfer("1000000", 11), transfer("9999999", 11), transfer("10000000", 12), transfer("100000000", 12), transfer("9007199254740993123456", 13)]);

describe("Exact analytical chart data", () => {
  it("reconciles every block and transfer-size split without losing base units", () => {
    const result = analytics();
    expect(sum(result.blockComposition.flatMap(point => point.buckets.map(bucket => BigInt(bucket.amountRaw))))).toBe(BigInt(result.amountRaw));
    expect(result.blockComposition.flatMap(point => point.buckets).reduce((n, bucket) => n + bucket.transfers, 0)).toBe(result.transfers);
    for (const point of result.blockSeries) expect(sum(result.blockComposition.find(item => item.blockNumber === point.blockNumber)!.buckets.map(bucket => BigInt(bucket.amountRaw)))).toBe(BigInt(point.amountRaw));
    expect(sum(buildChartData(result, widget()).points.flatMap(point => point.raw))).toBe(BigInt(result.amountRaw));
  });
  it("retains zero-value transfers in counts and excludes them from volume share", () => {
    const result = aggregateTransfers([transfer("0"), transfer("1000000")]);
    expect(buildChartData(result, widget({ metric: "transfers" })).points[0].raw[0]).toBe(1n);
    expect(buildChartData(result, widget()).points[0].raw[0]).toBe(0n);
    expect(shareValue(0n, 0n)).toBe(0);
    expect(shareValue(2n ** 250n, 2n ** 251n)).toBe(50);
  });
  it("rebuckets exact source records into UTC minutes, hours and Monday weeks", () => {
    const result = aggregateTransfers([transfer("1000001", 10, Date.parse("2025-01-05T23:59:59Z") / 1000), transfer("2000002", 11, Date.parse("2025-01-06T00:00:00Z") / 1000), transfer("3000003", 12, Date.parse("2025-01-06T00:00:30Z") / 1000)]);
    const minute = buildChartData(result, widget({ grouping: "time", interval: "minute" }));
    expect(minute.points).toHaveLength(2); expect(sum(minute.points[1].raw)).toBe(5000005n);
    const week = buildChartData(result, widget({ grouping: "time", interval: "week" }));
    expect(week.points.map(point => point.name)).toEqual(["2024-12-30", "2025-01-06"]);
    expect(sum(buildChartData(result, widget({ grouping: "time", interval: "hour" })).points.flatMap(point => point.raw))).toBe(6000006n);
  });
  it("includes Other for omitted wallet groups and reconciles a limited donut", () => {
    const result = aggregateTransfers(Array.from({ length: 30 }, (_, index) => transfer(String((index + 1) * 1000001), index + 10, 1736121600, "0x" + (index + 1).toString(16).padStart(40, "0"))));
    for (const metric of ["amount", "transfers"] as const) {
      const data = buildChartData(result, widget({ kind: "donut", grouping: "sender", metric }));
      expect(data.points.length).toBeLessThanOrEqual(12);
      expect(sum(data.points.flatMap(point => point.raw))).toBe(metric === "amount" ? BigInt(result.amountRaw) : 30n);
    }
  });
  it("keeps combo units separate and rankings sorted by their chosen measure", () => {
    const result = analytics(), combo = buildChartData(result, widget({ kind: "combo" }));
    expect(combo.series.map(series => series.decimals)).toEqual([6, 0]);
    expect(sum(combo.points.map(point => point.raw[1]))).toBe(BigInt(result.transfers));
    const ranking = buildChartData(result, widget({ kind: "horizontal", grouping: "distribution" }));
    expect(ranking.points[0].name).toBe("1,000+ USDC");
  });
  it("compresses heatmap columns while preserving all series totals", () => {
    const data = Array.from({ length: 203 }, (_, index) => ({ name: String(index), fullLabel: `Block ${index}`, raw: [BigInt(index), 1n] }));
    const compressed = compressHeatmap(data, 80);
    expect(compressed.length).toBeLessThanOrEqual(80);
    expect(sum(compressed.map(point => point.raw[0]))).toBe(sum(data.map(point => point.raw[0])));
    expect(sum(compressed.map(point => point.raw[1]))).toBe(203n);
  });
  it("exports exact decimal values and escapes CSV text and formula prefixes", () => {
    const csv = chartCsv([{ name: "test", fullLabel: '=SUM("A1")', raw: [9007199254740993123456n] }], [{ id: "s0", label: "Amount", color: "#000", decimals: 6 }]);
    expect(csv).toContain('"9007199254740993.123456"'); expect(csv).toContain('\'=SUM(""A1"")');
  });
  it("keeps empty results empty without fabricating a timeline", () => { expect(buildChartData(aggregateTransfers([]), widget()).points).toEqual([]); });
});
describe("Published visualization contracts", () => {
  it("round-trips all new chart kinds and preserves their exact query filters", () => {
    for (const kind of CHART_KINDS) {
      const current = changeChartKind(widget(), kind), document = { version: 1, title: "Charts", description: "", refreshMs: 0, widgets: [{ ...current, interval: "minute" }] };
      const text = JSON.stringify(document); expect(validateDashboard(JSON.parse(text)).widgets[0].kind).toBe(kind); expect(JSON.stringify(document)).toBe(text);
    }
  });
  it("rejects incompatible groupings, unsupported metrics and invalid intervals", () => {
    const document = (current: AxisWidget) => ({ version: 1, title: "Charts", description: "", refreshMs: 0, widgets: [current] });
    expect(() => validateDashboard(document(widget({ grouping: "sender" })))).toThrow("compatible grouping");
    expect(() => validateDashboard(document(widget({ metric: "uniqueWallets" })))).toThrow("Grouped charts");
    expect(() => validateDashboard(document({ ...widget(), interval: "year" } as unknown as AxisWidget))).toThrow("interval");
    expect(changeChartKind(widget({ kind: "metric", metric: "uniqueWallets" }), "donut")).toMatchObject({ metric: "transfers", grouping: "distribution" });
  });
});
