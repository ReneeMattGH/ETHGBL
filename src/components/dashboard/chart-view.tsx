"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMetricValue, type SeriesData } from "@/lib/visualization/build-data";
import { formatCompact } from "@/lib/format";
import type { VisualizationType } from "@/lib/dashboard/types";

const PIE_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "color-mix(in oklch, var(--color-chart-1) 60%, var(--color-chart-3))",
  "color-mix(in oklch, var(--color-chart-2) 60%, var(--color-chart-5))",
  "color-mix(in oklch, var(--color-chart-4) 60%, var(--color-chart-1))",
];

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  boxShadow: "0 8px 24px rgb(0 0 0 / 0.25)",
  fontSize: 11,
  padding: "6px 9px",
} as const;

const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 10 } as const;

function truncateLabel(value: string): string {
  return value.length > 18 ? `${value.slice(0, 15)}…` : value;
}

function formatAxisTick(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Math.abs(value) >= 1_000 ? formatCompact(value) : formatMetricValue(value);
}

export function ChartView({
  type,
  data,
  height = 240,
}: {
  type: Exclude<VisualizationType, "metric" | "table">;
  data: SeriesData;
  height?: number;
}) {
  const points = data.points;
  const rotateTicks = type === "bar" && points.length > 5;

  if (type === "pie") {
    const total = points.reduce((sum, point) => sum + point.y, 0);
    return (
      <div>
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={points}
                dataKey="y"
                nameKey="x"
                innerRadius="58%"
                outerRadius="82%"
                paddingAngle={2}
                stroke="var(--card)"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {points.map((point, index) => (
                  <Cell key={`${point.x}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                itemStyle={{ color: "var(--foreground)" }}
                formatter={(value) => {
                  const numeric = Number(value);
                  const share = total > 0 ? ` (${((numeric / total) * 100).toFixed(1)}%)` : "";
                  return [`${formatMetricValue(numeric)}${share}`, data.yLabel];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-1 grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
          {points.map((point, index) => (
            <li key={`${point.x}-legend-${index}`} className="flex min-w-0 items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-[2px]"
                style={{ background: PIE_COLORS[index % PIE_COLORS.length] }}
              />
              <span className="truncate text-[10.5px] text-muted-foreground" title={point.x}>
                {point.x}
              </span>
              <span className="tabular ml-auto text-[10.5px] text-foreground/80">
                {formatMetricValue(point.y)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (type === "line" || type === "area") {
    const Chart = type === "line" ? LineChart : AreaChart;
    return (
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <Chart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
            <CartesianGrid stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
            <XAxis
              dataKey="x"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tickFormatter={truncateLabel}
              minTickGap={18}
            />
            <YAxis
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(value: number) => formatAxisTick(value)}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              itemStyle={{ color: "var(--foreground)" }}
              labelStyle={{ color: "var(--muted-foreground)" }}
              formatter={(value) => [formatMetricValue(Number(value)), data.yLabel]}
            />
            {type === "line" ? (
              <Line
                type="monotone"
                dataKey="y"
                stroke="var(--color-chart-1)"
                strokeWidth={2}
                dot={points.length <= 24 ? { r: 2.5, fill: "var(--color-chart-1)", strokeWidth: 0 } : false}
                activeDot={{ r: 3.5 }}
                isAnimationActive={false}
                name={data.yLabel}
              />
            ) : (
              <Area
                type="monotone"
                dataKey="y"
                stroke="var(--color-chart-1)"
                strokeWidth={2}
                fill="var(--color-chart-1)"
                fillOpacity={0.16}
                isAnimationActive={false}
                name={data.yLabel}
              />
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, bottom: rotateTicks ? 14 : 0, left: -14 }}>
          <CartesianGrid stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
          <XAxis
            dataKey="x"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            interval={0}
            tickFormatter={truncateLabel}
            angle={rotateTicks ? -28 : 0}
            textAnchor={rotateTicks ? "end" : "middle"}
            height={rotateTicks ? 52 : 30}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(value: number) => formatAxisTick(value)}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            itemStyle={{ color: "var(--foreground)" }}
            labelStyle={{ color: "var(--muted-foreground)" }}
            cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
            formatter={(value) => [formatMetricValue(Number(value)), data.yLabel]}
          />
          <Bar
            dataKey="y"
            fill="var(--color-chart-1)"
            radius={[4, 4, 0, 0]}
            maxBarSize={44}
            isAnimationActive={false}
            name={data.yLabel}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
