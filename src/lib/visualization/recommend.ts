import { createId, type WidgetConfig } from "@/lib/dashboard/types";
import type { DatasetField } from "./fields";

/**
 * Builds a starter layout from fields that the current page of real entities actually contains.
 *
 * Only widgets whose required fields exist are produced, so every recommendation can render
 * without falling back to placeholder values.
 */
export function recommendWidgets(fields: DatasetField[], entityCount: number): WidgetConfig[] {
  if (entityCount === 0) return [];

  const numericAttributes = fields
    .filter((field) => field.kind === "attribute" && field.numeric && field.presentCount > 0)
    .sort((a, b) => b.presentCount - a.presentCount || a.name.localeCompare(b.name));
  const categoricalAttributes = fields
    .filter((field) => field.kind === "attribute" && field.categorical && field.presentCount > 0)
    .sort((a, b) => b.presentCount - a.presentCount || a.name.localeCompare(b.name));

  const numeric = numericAttributes[0] ?? null;
  const categorical = categoricalAttributes[0] ?? null;
  const createdAt = fields.find((field) => field.name === "$createdAt" && field.numeric) ?? null;

  const widgets: Omit<WidgetConfig, "id">[] = [
    { title: "Matching entities", type: "metric", width: 1 },
  ];

  if (numeric) {
    widgets.push({
      title: `Total ${numeric.label}`,
      type: "metric",
      width: 1,
      metricField: numeric.name,
      metricAggregation: "sum",
    });
    widgets.push({
      title: `Average ${numeric.label}`,
      type: "metric",
      width: 1,
      metricField: numeric.name,
      metricAggregation: "avg",
    });
  }

  if (categorical && numeric) {
    widgets.push({
      title: `Total ${numeric.label} by ${categorical.label}`,
      type: "bar",
      width: 3,
      groupField: categorical.name,
      yField: numeric.name,
      aggregation: "sum",
      maxGroups: 12,
    });
  } else if (categorical) {
    widgets.push({
      title: `Entities by ${categorical.label}`,
      type: "pie",
      width: 2,
      groupField: categorical.name,
      aggregation: "count",
      maxGroups: 8,
    });
  }

  if (numeric && createdAt && entityCount > 1) {
    widgets.push({
      title: `${numeric.label} by creation block`,
      type: "line",
      width: 3,
      xField: createdAt.name,
      yField: numeric.name,
      aggregation: "sum",
      maxGroups: 80,
    });
  }

  widgets.push({ title: "Entity data", type: "table", width: 3 });

  return widgets.map((widget) => ({ ...widget, id: createId("widget") }));
}
