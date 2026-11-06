import { describe, expect, it } from "vitest";
import type { EntityDto } from "@/lib/arkiv/types";
import { inferFields } from "@/lib/visualization/fields";
import { recommendWidgets } from "@/lib/visualization/recommend";

let keySeed = 0;

function entity(attributes: EntityDto["attributes"]): EntityDto {
  keySeed += 1;
  return {
    key: `0x${keySeed.toString(16).padStart(64, "0")}`,
    owner: null,
    creator: null,
    createdAt: "10",
    updatedAt: "10",
    expiresAt: "1000",
    creationFlags: null,
    attributes,
    attributeSchema: {},
  };
}

describe("recommendWidgets", () => {
  it("uses only fields present in the returned entities", () => {
    const entities = [
      entity({ amount: { type: "u64", value: "10" }, region: { type: "str", value: "EU" } }),
      entity({ amount: { type: "u64", value: "20" }, region: { type: "str", value: "US" } }),
    ];
    const widgets = recommendWidgets(inferFields(entities), entities.length);
    const types = widgets.map((widget) => widget.type);

    expect(types).toContain("metric");
    expect(types).toContain("bar");
    expect(types).toContain("line");
    expect(types).toContain("table");
    expect(types).not.toContain("pie");

    const bar = widgets.find((widget) => widget.type === "bar");
    expect(bar?.groupField).toBe("region");
    expect(bar?.yField).toBe("amount");
    expect(bar?.aggregation).toBe("sum");

    const line = widgets.find((widget) => widget.type === "line");
    expect(line?.xField).toBe("$createdAt");

    expect(new Set(widgets.map((widget) => widget.id)).size).toBe(widgets.length);
  });

  it("recommends a pie only when there is a categorical field but no numeric measure", () => {
    const entities = [
      entity({ region: { type: "str", value: "EU" } }),
      entity({ region: { type: "str", value: "US" } }),
    ];
    const widgets = recommendWidgets(inferFields(entities), entities.length);
    const types = widgets.map((widget) => widget.type);
    expect(types).toContain("pie");
    expect(types).not.toContain("bar");
    expect(types).not.toContain("line");
  });

  it("returns no layout for an empty result", () => {
    expect(recommendWidgets([], 0)).toEqual([]);
  });
});
