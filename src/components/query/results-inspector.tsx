"use client";

import { ArrowDown, Database, FolderPlus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypeBadge } from "@/components/ui/type-badge";
import type { QueryErrorDto, QueryResultDto } from "@/lib/arkiv/types";
import { formatBlock, formatDuration, formatInteger, pluralize } from "@/lib/format";
import { displayAttributeValue, type DatasetField } from "@/lib/visualization/fields";

type Status = "idle" | "loading" | "success" | "error";

function InspectorStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
      <dt className="stat-label">{label}</dt>
      <dd className="stat-value mt-1 truncate">{value}</dd>
    </div>
  );
}

export function ResultsInspector({
  status,
  result,
  error,
  fields,
  onRetry,
  onCreateDashboard,
}: {
  status: Status;
  result: QueryResultDto | null;
  error: QueryErrorDto | null;
  fields: DatasetField[];
  onRetry: () => void;
  onCreateDashboard: () => void;
}) {
  const running = status === "loading";
  const tone = running
    ? "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300"
    : status === "error" && !result
      ? "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300"
      : result && result.entities.length === 0
        ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : result
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-border bg-muted/40 text-muted-foreground";

  const label = running
    ? "Running"
    : status === "error" && !result
      ? "Failed"
      : result && result.entities.length === 0
        ? "No matches"
        : result
          ? "Live result"
          : "Waiting";

  const attributeFields = fields
    .filter((field) => field.kind === "attribute" && field.presentCount > 0)
    .slice(0, 6);

  return (
    <section className="panel flex h-full flex-col gap-4" aria-label="Result inspector">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="section-title">Result inspector</h2>
          <p className="section-subtitle mt-0.5">
            Counts, fields and block metadata from the node.
          </p>
        </div>
        <Badge variant="outline" className={`gap-1.5 font-normal ${tone}`}>
          {running && <RefreshCw className="size-3 animate-spin" />}
          {label}
        </Badge>
      </div>

      {running && !result ? (
        <div className="grid grid-cols-2 gap-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="mt-2 h-4 w-20" />
            </div>
          ))}
        </div>
      ) : result ? (
        <>
          <dl className="grid grid-cols-2 gap-2">
            <InspectorStat
              label="Matching entities"
              value={result.count === null ? "—" : formatInteger(result.count)}
            />
            <InspectorStat label="Rows loaded" value={formatInteger(result.entities.length)} />
            <InspectorStat label="Read at block" value={formatBlock(result.blockNumber)} />
            <InspectorStat label="Round trip" value={formatDuration(result.durationMs)} />
          </dl>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="stat-label">Detected fields</span>
              <span className="text-[10px] text-muted-foreground">
                {fields.length} {pluralize(fields.length, "field")}
              </span>
            </div>
            {fields.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/70 px-3 py-3 text-[11.5px] text-muted-foreground">
                No fields were returned in this page.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {attributeFields.map((field) => (
                  <span
                    key={field.name}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/60 bg-background/40 px-1.5 py-1"
                    title={`${field.name} · ${Math.round(field.presence * 100)}% present`}
                  >
                    <span className="truncate font-mono text-[10px] text-foreground/90">
                      {field.name}
                    </span>
                    <TypeBadge type={field.type} />
                    <span className="tabular text-[9px] text-muted-foreground">
                      {Math.round(field.presence * 100)}%
                    </span>
                  </span>
                ))}
                {fields.length > attributeFields.length && (
                  <span className="inline-flex items-center rounded-md border border-border/60 px-1.5 py-1 text-[10px] text-muted-foreground">
                    +{fields.length - attributeFields.length} more
                  </span>
                )}
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="stat-label">Entity preview</span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <ArrowDown className="size-3" />
                full table below
              </span>
            </div>
            {result.entities.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-[11.5px] leading-relaxed text-muted-foreground">
                The query executed successfully but matched no entities at this block.
              </p>
            ) : (
              <ul className="space-y-1">
                {result.entities.slice(0, 3).map((entity) => {
                  const sample = Object.entries(entity.attributes)[0];
                  return (
                    <li
                      key={entity.key}
                      className="flex items-center gap-2 rounded-md border border-border/50 bg-background/30 px-2 py-1.5"
                    >
                      <Database className="size-3 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-foreground/90">
                        {entity.key.slice(0, 14)}…{entity.key.slice(-8)}
                      </span>
                      {sample && (
                        <span className="hidden max-w-[9rem] truncate font-mono text-[10px] text-muted-foreground sm:block">
                          {sample[0]}={displayAttributeValue(sample[1].type, sample[1].value)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : status === "error" && error ? (
        <div className="rounded-lg border border-red-500/25 bg-red-500/[0.05] px-3 py-3">
          <p className="text-[11.5px] font-medium text-red-700 dark:text-red-300">
            {error.code} · {error.message}
          </p>
          {error.detail && (
            <p className="mt-1 line-clamp-4 break-all font-mono text-[10px] leading-relaxed text-red-700/80 dark:text-red-300/80">
              {error.detail}
            </p>
          )}
          <Button variant="outline" size="xs" className="mt-2.5 gap-1.5" onClick={onRetry}>
            <RefreshCw className="size-3" />
            Retry request
          </Button>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border/70 px-4 py-8 text-center">
          <Database className="mb-2 size-5 text-muted-foreground" />
          <p className="text-[12px] text-muted-foreground">Run the query to inspect real results.</p>
        </div>
      )}

      {result && (
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <p className="text-[10.5px] text-muted-foreground">
            {formatInteger(result.entities.length)} rows · block {formatBlock(result.blockNumber)}
          </p>
          <Button
            size="xs"
            className="gap-1.5"
            onClick={onCreateDashboard}
            disabled={result.entities.length === 0}
          >
            <FolderPlus className="size-3.5" />
            Create dashboard
          </Button>
        </div>
      )}
    </section>
  );
}
