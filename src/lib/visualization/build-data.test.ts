import { describe, expect, it } from "vitest";
import type { EntityDto } from "@/lib/arkiv/types";
import type { WidgetConfig } from "@/lib/dashboard/types";
import { buildMetric, buildSeries } from "@/lib/visualization/build-data";
import { inferFields } from "@/lib/visualization/fields";

let keySeed = 0;

function entity(
  attributes: EntityDto["attributes"],
  overrides: Partial<EntityDto> = {},
): EntityDto {
  keySeed += 1;
  return {
    key: `0x${keySeed.toString(16).padStart(64, "0")}`,
    owner: `0x${"11".repeat(20)}`,
    creator: `0x${"22".repeat(20)}`,
    createdAt: "10",
    updatedAt: "10",
    expiresAt: "1000",
    creationFlags: null,
    attributes,
    attributeSchema: {},
    ...overrides,
  };
}

function widget(overrides: Partial<WidgetConfig>): WidgetConfig {
  return { id: "test", title: "", type: "bar", width: 2, ...overrides };
}

const entities = [
  entity({ amount: { type: "u64", value: "10" }, region: { type: "str", value: "EU" } }, { createdAt: "10" }),
  entity({ amount: { type: "u64", value: "20" }, region: { type: "str", value: "EU" } }, { createdAt: "20" }),
  entity({ amount: { type: "u64", value: "5" }, region: { type: "str", value: "US" } }, { createdAt: "30" }),
  entity({ region: { type: "str", value: "US" } }, { createdAt: "40" }),
];

const fields = inferFields(entities);

describe("buildMetric", () => {
  it("uses the node-reported total for the count metric", () => {
    const metric = buildMetric(widget({ type: "metric" }), entities, fields, "42");
    expect(metric.display).toBe("42");
    expect(metric.numericValue).toBe(42);
  });

  it("falls back to the loaded row count when count was not requested", () => {
    const metric = buildMetric(widget({ type: "metric" }), entities, fields, null);
    expect(metric.display).toBe("4");
    expect(metric.caption).toContain("entities returned in this page");
  });

  it("aggregates only entities that actually carry the numeric field", () => {
    const metric = buildMetric(
      widget({ type: "metric", metricField: "amount", metricAggregation: "sum" }),
      entities,
      fields,
      "4",
    );
    expect(metric.numericValue).toBe(35);
    expect(metric.display).toBe("35");
    expect(metric.caption).toContain("across 3 entities");
  });

  it("reports a missing value instead of inventing one", () => {
    const metric = buildMetric(
      widget({ type: "metric", metricField: "missing", metricAggregation: "sum" }),
      entities,
      fields,
      "4",
    );
    expect(metric.display).toBe("—");
    expect(metric.numericValue).toBeNull();
  });
});

describe("buildSeries", () => {
  it("counts entities per real category", () => {
    const series = buildSeries(
      widget({ type: "bar", groupField: "region", aggregation: "count" }),
      entities,
      fields,
    );
    expect(series.ok).toBe(true);
    if (!series.ok) return;
    expect(series.data.points).toEqual([
      { x: "EU", y: 2 },
      { x: "US", y: 2 },
    ]);
  });

  it("sums a numeric measure and discloses excluded entities", () => {
    const series = buildSeries(
      widget({ type: "bar", groupField: "region", yField: "amount", aggregation: "sum" }),
      entities,
      fields,
    );
    expect(series.ok).toBe(true);
    if (!series.ok) return;
    expect(series.data.points).toEqual([
      { x: "EU", y: 30 },
      { x: "US", y: 5 },
    ]);
    expect(series.data.note).toContain("1 entity without a numeric Amount");
  });

  it("builds a time series ordered by the block axis", () => {
    const series = buildSeries(
      widget({ type: "line", xField: "$createdAt", yField: "amount", aggregation: "sum" }),
      entities,
      fields,
    );
    expect(series.ok).toBe(true);
    if (!series.ok) return;
    expect(series.data.points.map((point) => point.x)).toEqual(["#10", "#20", "#30"]);
  });

  it("drops non-positive groups from a share chart", () => {
    const signed = [
      entity({ delta: { type: "i32", value: -5 }, kind: { type: "str", value: "A" } }),
      entity({ delta: { type: "i32", value: 3 }, kind: { type: "str", value: "B" } }),
    ];
    const signedFields = inferFields(signed);
    const series = buildSeries(
      widget({ type: "pie", groupField: "kind", yField: "delta", aggregation: "sum" }),
      signed,
      signedFields,
    );
    expect(series.ok).toBe(true);
    if (!series.ok) return;
    expect(series.data.points).toEqual([{ x: "B", y: 3 }]);
    expect(series.data.note).toContain("zero or negative");
  });

  it("refuses to chart a field that does not exist", () => {
    const series = buildSeries(
      widget({ type: "bar", groupField: "nope", aggregation: "count" }),
      entities,
      fields,
    );
    expect(series.ok).toBe(false);
  });
});
