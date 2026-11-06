import type { EntityDto } from "@/lib/arkiv/types";
import type { Aggregation, WidgetConfig } from "@/lib/dashboard/types";
import { AGGREGATION_LABELS } from "@/lib/dashboard/types";
import {
  formatCompact,
  formatDecimal,
  formatInteger,
} from "@/lib/format";
import { getCategoryValue, getField, getNumericValue, hasFieldValue, type DatasetField } from "./fields";

export type MetricData = {
  display: string;
  caption: string;
  numericValue: number | null;
};

export type SeriesPoint = { x: string; y: number };

export type SeriesData = {
  points: SeriesPoint[];
  xLabel: string;
  yLabel: string;
  note: string | null;
};

export type SeriesBuild = { ok: true; data: SeriesData } | { ok: false; message: string };

function aggregate(values: number[], aggregation: Exclude<Aggregation, "count">): number | null {
  if (values.length === 0) return null;
  switch (aggregation) {
    case "sum":
      return values.reduce((total, value) => total + value, 0);
    case "avg":
      return values.reduce((total, value) => total + value, 0) / values.length;
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    default:
      return null;
  }
}

export function formatMetricValue(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Number.isInteger(value)) return formatInteger(value);
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000) return formatCompact(value);
  return formatDecimal(value, magnitude < 1 ? 4 : 2);
}

function formatXLabel(field: DatasetField, value: number): string {
  if (field.name === "$createdAt" || field.name === "$updatedAt" || field.name === "$expiresAt") {
    return `#${formatInteger(value)}`;
  }
  return formatMetricValue(value);
}

export function buildMetric(
  widget: WidgetConfig,
  entities: EntityDto[],
  fields: DatasetField[],
  totalCount: string | null,
): MetricData {
  if (!widget.metricField) {
    const loaded = entities.length;
    if (totalCount !== null) {
      const total = Number(totalCount);
      return {
        display: formatInteger(total),
        caption: `matching entities at this block · ${formatInteger(loaded)} loaded`,
        numericValue: Number.isFinite(total) ? total : null,
      };
    }
    return {
      display: formatInteger(loaded),
      caption: "entities returned in this page",
      numericValue: loaded,
    };
  }

  const field = getField(fields, widget.metricField);
  if (!field || !field.numeric) {
    return { display: "—", caption: `${widget.metricField} is not a numeric field`, numericValue: null };
  }

  const aggregation = widget.metricAggregation ?? "sum";

  if (aggregation === "count") {
    const present = entities.filter((entity) => hasFieldValue(entity, field)).length;
    return {
      display: formatInteger(present),
      caption: `entities with ${field.label}, across ${formatInteger(entities.length)} loaded`,
      numericValue: present,
    };
  }

  const values = entities
    .map((entity) => getNumericValue(entity, field))
    .filter((value): value is number => value !== null);

  const value = aggregate(values, aggregation);
  if (value === null) {
    return {
      display: "—",
      caption: `No numeric values for ${field.label} in the returned entities`,
      numericValue: null,
    };
  }

  return {
    display: formatMetricValue(value),
    caption: `${AGGREGATION_LABELS[aggregation].toLowerCase()} of ${field.label} across ${formatInteger(values.length)} entities`,
    numericValue: value,
  };
}

type Group = {
  label: string;
  sortValue: number | null;
  count: number;
  values: number[];
};

export function buildSeries(
  widget: WidgetConfig,
  entities: EntityDto[],
  fields: DatasetField[],
): SeriesBuild {
  const isTimeSeries = widget.type === "line" || widget.type === "area";
  const measure = getField(fields, widget.yField);
  const aggregation: Aggregation = widget.aggregation ?? (measure ? "sum" : "count");

  if (aggregation !== "count" && !measure) {
    return { ok: false, message: "Choose a numeric measure, or set the aggregation to Count." };
  }
  if (aggregation !== "count" && measure && !measure.numeric) {
    return { ok: false, message: `${measure.label} is not numeric and cannot be aggregated.` };
  }

  const xField = isTimeSeries ? getField(fields, widget.xField) : null;
  const groupField = !isTimeSeries ? getField(fields, widget.groupField) : null;

  if (isTimeSeries && !xField) {
    return { ok: false, message: "Choose a numeric field for the X axis." };
  }
  if (isTimeSeries && xField && !xField.numeric) {
    return { ok: false, message: `${xField.label} is not numeric, so it cannot be a line-chart axis.` };
  }
  if (!isTimeSeries && !groupField) {
    return { ok: false, message: "Choose a field to group the query results by." };
  }

  const groups = new Map<string, Group>();
  let missing = 0;

  for (const entity of entities) {
    let key: string;
    let label: string;
    let sortValue: number | null = null;

    if (isTimeSeries && xField) {
      const numeric = getNumericValue(entity, xField);
      if (numeric === null) {
        missing += 1;
        continue;
      }
      key = String(numeric);
      label = formatXLabel(xField, numeric);
      sortValue = numeric;
    } else if (groupField) {
      const category = getCategoryValue(entity, groupField);
      if (!category) {
        missing += 1;
        continue;
      }
      key = category.key;
      label = category.label;
    } else {
      continue;
    }

    let group = groups.get(key);
    if (!group) {
      group = { label, sortValue, count: 0, values: [] };
      groups.set(key, group);
    }

    if (aggregation === "count") {
      if (measure) {
        if (!hasFieldValue(entity, measure)) {
          missing += 1;
          continue;
        }
      }
      group.count += 1;
      continue;
    }

    if (measure) {
      const value = getNumericValue(entity, measure);
      if (value === null) {
        missing += 1;
        continue;
      }
      group.values.push(value);
    }
  }

  if (groups.size === 0) {
    if (entities.length === 0) return { ok: false, message: "The query returned no entities." };
    return {
      ok: false,
      message: "No groups could be built from the returned entities with the selected fields.",
    };
  }

  let points: (SeriesPoint & { sortValue: number | null })[] = [];

  for (const group of groups.values()) {
    let y: number | null;
    if (aggregation === "count") {
      y = group.count;
    } else {
      y = aggregate(group.values, aggregation);
    }
    if (y === null || !Number.isFinite(y)) continue;
    points.push({ x: group.label, y, sortValue: group.sortValue });
  }

  const notes: string[] = [];
  if (missing > 0) {
    const target = isTimeSeries ? xField?.label : measure?.label;
    notes.push(
      `${formatInteger(missing)} ${missing === 1 ? "entity" : "entities"} without a numeric ${
        target ?? "value"
      } ${missing === 1 ? "was" : "were"} excluded.`,
    );
  }

  const maxGroups = widget.maxGroups ?? (widget.type === "pie" ? 8 : widget.type === "bar" ? 12 : 80);

  if (widget.type === "pie") {
    const nonPositive = points.filter((point) => point.y <= 0).length;
    points = points.filter((point) => point.y > 0);
    if (nonPositive > 0) {
      notes.push(`${formatInteger(nonPositive)} groups with zero or negative values are omitted from a share chart.`);
    }
  }

  points.sort((a, b) => {
    if (isTimeSeries) return (a.sortValue ?? 0) - (b.sortValue ?? 0);
    return b.y - a.y;
  });

  if (points.length > maxGroups) {
    const rest = points.slice(maxGroups);
    points = points.slice(0, maxGroups);
    if (widget.type === "pie") {
      const otherTotal = rest.reduce((total, point) => total + point.y, 0);
      if (otherTotal > 0) {
        points.push({ x: `Other (${formatInteger(rest.length)})`, y: otherTotal, sortValue: null });
      }
    } else {
      notes.push(
        `Showing ${formatInteger(maxGroups)} of ${formatInteger(maxGroups + rest.length)} groups.`,
      );
    }
  }

  if (points.length === 0) {
    return { ok: false, message: "No positive data points are available for this visualization." };
  }

  const yLabel =
    aggregation === "count"
      ? measure
        ? `Entities with ${measure.label}`
        : "Entities"
      : `${AGGREGATION_LABELS[aggregation]} of ${measure?.label ?? "value"}`;

  const xLabel = isTimeSeries ? (xField?.label ?? "Axis") : (groupField?.label ?? "Group");

  return {
    ok: true,
    data: {
      points: points.map(({ x, y }) => ({ x, y })),
      xLabel,
      yLabel,
      note: notes.length > 0 ? notes.join(" ") : null,
    },
  };
}

export function widgetTitle(widget: WidgetConfig, fields: DatasetField[]): string {
  if (widget.title.trim()) return widget.title.trim();
  const measure = getField(fields, widget.yField);
  const aggregation = widget.aggregation ?? (measure ? "sum" : "count");
  const measureLabel =
    aggregation === "count" ? (measure ? `Entities with ${measure.label}` : "Entities") : measure?.label ?? "Value";

  switch (widget.type) {
    case "metric":
      return "Matching entities";
    case "line":
    case "area":
      return `${measureLabel} by ${getField(fields, widget.xField)?.label ?? "axis"}`;
    case "bar":
    case "pie":
      return `${measureLabel} by ${getField(fields, widget.groupField)?.label ?? "group"}`;
    case "table":
      return "Entity data";
    default:
      return "Widget";
  }
}
