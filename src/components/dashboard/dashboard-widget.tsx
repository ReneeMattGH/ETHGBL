"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TypeBadge } from "@/components/ui/type-badge";
import { EntitiesTable } from "@/components/query/entities-table";
import { EntityDetailDialog } from "@/components/query/entity-detail-dialog";
import { VISUALIZATION_META, type WidgetConfig } from "@/lib/dashboard/types";
import type { EntityDto } from "@/lib/arkiv/types";
import { formatBlock, formatInteger } from "@/lib/format";
import { buildMetric, buildSeries, widgetTitle } from "@/lib/visualization/build-data";
import { getField, type DatasetField } from "@/lib/visualization/fields";
import { ChartView } from "./chart-view";

export const WIDGET_WIDTH_CLASS: Record<1 | 2 | 3, string> = {
  1: "md:col-span-1",
  2: "md:col-span-2",
  3: "md:col-span-3",
};

function WidgetFooter({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-t border-border/60 px-4 py-2 text-[10.5px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

function FieldHint({ field }: { field: DatasetField | null }) {
  if (!field) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-[10px] text-foreground/80">{field.name}</span>
      <TypeBadge type={field.type} />
    </span>
  );
}

export function DashboardWidget({
  widget,
  entities,
  fields,
  totalCount,
  blockNumber,
  queryLimit,
}: {
  widget: WidgetConfig;
  entities: EntityDto[];
  fields: DatasetField[];
  totalCount: string | null;
  blockNumber: string | null;
  queryLimit: number;
}) {
  const [selected, setSelected] = React.useState<EntityDto | null>(null);
  const title = widgetTitle(widget, fields);
  const meta = VISUALIZATION_META[widget.type];

  let body: React.ReactNode;
  let footer: React.ReactNode = null;

  if (widget.type === "metric") {
    const metric = buildMetric(widget, entities, fields, totalCount);
    const field = getField(fields, widget.metricField);
    body = (
      <div className="flex flex-1 flex-col justify-center px-4 py-5">
        <p className="tabular text-[2rem] font-semibold leading-none tracking-[-0.02em] text-foreground">
          {metric.display}
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">{metric.caption}</p>
        {metric.numericValue !== null && widget.metricField && field && (
          <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>aggregation</span>
            <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase">
              {widget.metricAggregation ?? "sum"}
            </Badge>
            <FieldHint field={field} />
          </div>
        )}
      </div>
    );
  } else if (widget.type === "table") {
    body = (
      <div className="flex-1 px-3 pb-3">
        {entities.length === 0 ? (
          <p className="px-1 py-6 text-[12px] text-muted-foreground">
            The query returned no entities at this block.
          </p>
        ) : (
          <EntitiesTable
            entities={entities}
            fields={fields}
            blockNumber={blockNumber}
            onSelect={setSelected}
            showCreator
            showUpdated
            enableSearch
            enablePagination
            pageSize={10}
          />
        )}
      </div>
    );
    footer = `Showing all ${formatInteger(entities.length)} entities returned by the page limit ${formatInteger(queryLimit)}. Search, sort and page through them client-side.`;
  } else {
    const series = buildSeries(widget, entities, fields);
    if (!series.ok) {
      body = (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
          <AlertTriangle className="size-4 text-amber-500" />
          <p className="max-w-xs text-[11.5px] text-muted-foreground">{series.message}</p>
        </div>
      );
    } else {
      body = (
        <div className="flex-1 px-2 pb-2">
          <ChartView type={widget.type} data={series.data} height={widget.width === 1 ? 210 : 250} />
        </div>
      );
      footer = series.ok ? series.data.note : null;
    }
  }

  return (
    <article className="panel flex w-full flex-col overflow-hidden p-0">
      <header className="flex items-start justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-[12.5px] font-medium text-foreground" title={title}>
            {title}
          </h3>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {meta.label}
          </p>
        </div>
        <Badge
          variant="outline"
          className="hidden shrink-0 font-mono text-[9.5px] text-muted-foreground md:inline-flex"
        >
          {widget.width}/3
        </Badge>
      </header>

      {body}

      <WidgetFooter>
        {footer ? <>{footer} </> : null}
        Aggregated from {formatInteger(entities.length)} rows at block{" "}
        {formatBlock(blockNumber)}.
      </WidgetFooter>

      {widget.type === "table" && (
        <EntityDetailDialog
          entity={selected}
          blockNumber={blockNumber}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        />
      )}
    </article>
  );
}

export function WidgetSkeleton({ width }: { width: 1 | 2 | 3 }) {
  return (
    <div className={`panel flex flex-col gap-3 p-4 ${WIDGET_WIDTH_CLASS[width]}`}>
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-2.5 w-20" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-2.5 w-48" />
    </div>
  );
}
