import type { NetworkId } from "@/lib/arkiv/networks";

export type VisualizationType = "metric" | "line" | "bar" | "area" | "pie" | "table";

export type Aggregation = "count" | "sum" | "avg" | "min" | "max";

export type WidgetConfig = {
  id: string;
  title: string;
  type: VisualizationType;
  width: 1 | 2 | 3;
  /** Metric widgets: omit to use the node's matching-entity count. */
  metricField?: string;
  metricAggregation?: Aggregation;
  xField?: string;
  /** Omit to count entities per group instead of aggregating a field. */
  yField?: string;
  aggregation?: Aggregation;
  groupField?: string;
  maxGroups?: number;
};

export type DashboardConfig = {
  version: 1;
  id: string;
  name: string;
  network: NetworkId;
  query: {
    text: string;
    limit: number;
  };
  widgets: WidgetConfig[];
  layout: {
    columns: number;
  };
  refreshIntervalMs: number;
  createdAt: string;
  updatedAt: string;
};

export const VISUALIZATION_META: Record<
  VisualizationType,
  { label: string; description: string }
> = {
  metric: {
    label: "Metric",
    description: "A single headline value from the result set.",
  },
  line: {
    label: "Line chart",
    description: "A measure plotted across a numeric axis.",
  },
  bar: {
    label: "Bar chart",
    description: "Compare a measure across categories.",
  },
  area: {
    label: "Area chart",
    description: "A line chart with a filled volume.",
  },
  pie: {
    label: "Donut chart",
    description: "Share of a measure across categories.",
  },
  table: {
    label: "Data table",
    description: "Every returned entity and its fields.",
  },
};

export const AGGREGATION_LABELS: Record<Aggregation, string> = {
  count: "Count",
  sum: "Sum",
  avg: "Average",
  min: "Minimum",
  max: "Maximum",
};

export function createId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
