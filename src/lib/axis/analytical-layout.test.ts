import { describe, expect, it } from "vitest";
import { allocationTiles, concentrationPoints, relationshipFlow } from "./analytical-layout";
import { analyticalWidget, changeChartKind } from "./chart-config";
import { aggregateTransfers } from "./core";
import { buildChartData, exactValue } from "./chart-data";
import { ANALYTICAL_CHART_KINDS, USDC, type AxisWidget, type Transfer } from "./model";
import { compositionTimeline, relationshipChart, transferComposition } from "./catalog-insights";

const widget: AxisWidget = { id: "chart", title: "Activity", kind: "line", metric: "amount", grouping: "time", interval: "minute", width: 2, query: { datasetKey: "0x" + "1".repeat(64), filters: {} } };
const point = (name: string, value: bigint) => ({ name, fullLabel: name, raw: [value] });
describe("Analytical presentations and exact composition", () => {
  it("conserves relationship counts across both flow sides and filtered series", () => {
    const chart = relationshipChart("Roles", "Records", [{ protocol: "A", role: "pool" }, { protocol: "A", role: "pool" }, { protocol: "A", role: "router" }, { protocol: "B", role: "router" }], "protocol", "role", { source: "Protocol", target: "Role" });
    const data = { points: chart.points.map(point => ({ name: point.label, fullLabel: point.label, raw: point.values!.map(BigInt) })), series: chart.series!.map(series => ({ ...series, decimals: 0, color: "#2553ff" })) };
    for (const visible of [[0, 1], [0], [1], []]) {
      const flow = relationshipFlow(data, visible);
      expect(flow.sources.reduce((sum, node) => sum + node.raw, 0n)).toBe(flow.total);
      expect(flow.targets.reduce((sum, node) => sum + node.raw, 0n)).toBe(flow.total);
      expect(flow.links.reduce((sum, link) => sum + link.raw, 0n)).toBe(flow.total);
      for (const node of flow.sources) expect(flow.links.filter(link => link.source.index === node.index).reduce((sum, link) => sum + link.raw, 0n)).toBe(node.raw);
      for (const link of flow.links) expect(link.path).not.toMatch(/NaN|Infinity/);
    }
  });
  it("combines excess categories without losing intersections or records", () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({ source: `source-${index}`, target: `target-${index % 17}` }));
    const chart = relationshipChart("Coverage", "Records", rows, "source", "target", { source: "Source", target: "Target" }, "matrix");
    expect(chart.points).toHaveLength(12); expect(chart.series).toHaveLength(12);
    expect(chart.points.flatMap(point => point.values!).reduce((sum, value) => sum + BigInt(value), 0n)).toBe(50n);
    expect(chart.points.at(-1)?.label).toBe("Other categories");
  });
  it("upgrades legacy plots without changing source queries or mutating stored definitions", () => {
    for (const kind of ["line", "area", "bar", "stacked"] as const) {
      const original = { ...widget, kind };
      expect(analyticalWidget(original)).toMatchObject({ kind: "stacked-area", query: widget.query, metric: "amount" });
      expect(original.kind).toBe(kind);
    }
    expect(analyticalWidget({ ...widget, kind: "bar", grouping: "sender" }).kind).toBe("treemap");
    expect(analyticalWidget({ ...widget, kind: "share" }).kind).toBe("share-area");
    expect(analyticalWidget({ ...widget, kind: "horizontal", grouping: "sender" }).kind).toBe("ranked");
    expect(ANALYTICAL_CHART_KINDS).not.toContain("line"); expect(ANALYTICAL_CHART_KINDS).not.toContain("bar");
  });
  it("partitions treemap geometry proportionally without dropping or rewriting exact values", () => {
    const points = [point("A", 7n), point("B", 2n), point("C", 1n), point("Zero", 0n)];
    const tiles = allocationTiles(points);
    expect(tiles).toHaveLength(3);
    expect(tiles.reduce((sum, tile) => sum + tile.width * tile.height, 0)).toBeCloseTo(900 * 330, 5);
    for (const tile of tiles) {
      expect(tile.width * tile.height / (900 * 330)).toBeCloseTo(Number(tile.point.raw[0]) / 10, 8);
      expect(tile.x).toBeGreaterThanOrEqual(0); expect(tile.y).toBeGreaterThanOrEqual(0);
      expect(tile.x + tile.width).toBeLessThanOrEqual(900.000001);
    }
    expect(points[3].raw[0]).toBe(0n);
    expect(allocationTiles([point("Huge", 2n ** 255n), point("Tiny", 1n)]).every(tile => Number.isFinite(tile.width))).toBe(true);
  });
  it("calculates a reconciled cumulative concentration curve with deterministic ranking", () => {
    const rows = concentrationPoints([point("C", 1n), point("B", 2n), point("A", 7n)]);
    expect(rows.map(row => row.point.name)).toEqual(["A", "B", "C"]);
    expect(rows.map(row => row.cumulative)).toEqual([7n, 9n, 10n]);
    expect(rows.at(-1)?.cumulative).toBe(rows[0].total);
  });
  it("keeps true protocol categories and zeroes only within observed time buckets", () => {
    const chart = compositionTimeline("Trades", "Trades", [
      { protocol: "A", timestamp: "1794000000" }, { protocol: "B", timestamp: "1794000010" }, { protocol: "A", timestamp: "1794000120" },
    ], "protocol");
    expect(chart.kind).toBe("stacked-area");
    expect(chart.series?.map(series => series.label)).toEqual(["A", "B"]);
    expect(chart.points).toHaveLength(2);
    expect(chart.points.map(point => point.values)).toEqual([["1", "1"], ["1", "0"]]);
    expect(chart.points.reduce((sum, point) => sum + BigInt(point.value), 0n)).toBe(3n);
  });
  it("reconciles transfer-size areas, percentage views and catalog data at exact base-unit precision", () => {
    const rows: Transfer[] = ["1", "1000001", "9007199254740993123"].map((amountRaw, index) => ({ sourceId: String(index), chainId: 137, contract: USDC, blockNumber: String(index + 10), blockHash: "0x" + "a".repeat(64), timestamp: String(1794000000 + index * 60), txHash: "0x" + "b".repeat(64), txIndex: 0, logIndex: index, sender: "0x" + "1".repeat(40), recipient: "0x" + "2".repeat(40), amountRaw, amount: exactValue(BigInt(amountRaw), 6), decimals: 6, contentHash: "0x" + "a".repeat(64) }));
    const analytics = aggregateTransfers(rows), catalog = transferComposition("Volume", analytics, true);
    expect(catalog.series).toHaveLength(analytics.distribution.length);
    expect(catalog.points.flatMap(point => point.values!).reduce((sum, value) => sum + BigInt(value), 0n)).toBe(BigInt(analytics.amountRaw));
    for (const kind of ["stacked-area", "share-area", "heatmap"] as const) {
      const data = buildChartData(analytics, changeChartKind(widget, kind));
      expect(data.points.flatMap(point => point.raw).reduce((sum, value) => sum + value, 0n)).toBe(BigInt(analytics.amountRaw));
    }
  });
});
