"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Compass,
  Database,
  FolderPlus,
  Globe2,
  Layers,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypeBadge } from "@/components/ui/type-badge";
import { ConnectionBadge } from "@/components/network/connection-badge";
import { EntityDetailDialog } from "@/components/query/entity-detail-dialog";
import { QueryCodeBlock } from "@/components/query/query-editor";
import { useQueryRunner } from "@/hooks/use-query-runner";
import type { EntityDto } from "@/lib/arkiv/types";
import { QUERY_EXAMPLES } from "@/lib/arkiv/query-language";
import {
  formatBlock,
  formatDuration,
  formatInteger,
  formatRelativeTime,
  pluralize,
} from "@/lib/format";
import { inferFields, displayAttributeValue } from "@/lib/visualization/fields";
import { useNow } from "@/hooks/use-now";

const DISCOVERY_LIMIT = 15;

export function ExploreView() {
  const runner = useQueryRunner();
  const { state, run, isLoading } = runner;
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [selected, setSelected] = React.useState<EntityDto | null>(null);
  const now = useNow(true, 1_000);

  const active = QUERY_EXAMPLES[activeIndex];
  const result = state.result;
  const fields = React.useMemo(() => inferFields(result?.entities ?? []), [result]);
  const attributeFields = fields.filter((field) => field.kind === "attribute" && field.presentCount > 0);

  const runLens = React.useCallback(
    (index: number) => {
      setActiveIndex(index);
      setSelected(null);
      void run({
        network: "rabdi",
        query: QUERY_EXAMPLES[index].query,
        limit: DISCOVERY_LIMIT,
        offset: 0,
        count: true,
      });
    },
    [run],
  );

  React.useEffect(() => {
    runLens(0);
    // Run the first discovery lens once on mount against the live node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queryHref = `/query?${new URLSearchParams({
    query: active.query,
    limit: String(DISCOVERY_LIMIT),
    network: "rabdi",
  }).toString()}`;

  const failed = state.status === "error" && state.error;
  const lensRan = result?.executedQuery === active.query;

  const tone = isLoading
    ? "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300"
    : failed
      ? "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300"
      : result && lensRan
        ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        : "border-border bg-muted/40 text-muted-foreground";

  return (
    <div className="space-y-5">
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="panel min-w-0 space-y-3" aria-label="Discovery lenses">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="section-title">Keyspace lenses</h2>
              <p className="section-subtitle mt-0.5">
                Verified query patterns. Each runs against the live node.
              </p>
            </div>
            <Badge variant="outline" className="font-mono text-[9px]">
              {QUERY_EXAMPLES.length} lenses
            </Badge>
          </div>

          <div className="space-y-2">
            {QUERY_EXAMPLES.map((lens, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={lens.label}
                  type="button"
                  onClick={() => runLens(index)}
                  disabled={isLoading && isActive}
                  aria-pressed={isActive}
                  className={`flex w-full min-w-0 flex-col gap-1.5 overflow-hidden rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    isActive
                      ? "border-primary/40 bg-primary/[0.07]"
                      : "border-border/70 bg-background/25 hover:border-border hover:bg-background/50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[9.5px] text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[12.5px] font-medium text-foreground">{lens.label}</span>
                    {isActive && isLoading && (
                      <RefreshCw className="ml-auto size-3 animate-spin text-primary" />
                    )}
                    {isActive && !isLoading && lensRan && result && (
                      <Badge
                        variant="outline"
                        className="ml-auto h-4 px-1.5 font-mono text-[9px] text-muted-foreground"
                      >
                        {result.count === null ? formatInteger(result.entities.length) : formatInteger(result.count)}
                      </Badge>
                    )}
                  </span>
                  <span className="text-[11px] leading-snug text-muted-foreground">
                    {lens.description}
                  </span>
                  <code className="line-clamp-1 min-w-0 break-all font-mono text-[10px] text-primary/80">
                    {lens.query}
                  </code>
                </button>
              );
            })}
          </div>

          <p className="flex items-start gap-1.5 border-t border-border/60 pt-2.5 text-[10.5px] leading-relaxed text-muted-foreground">
            <Layers className="mt-0.5 size-3 shrink-0" />
            Lenses are read-only. Use the query builder to edit a pattern, add predicates and turn a
            result into a dashboard.
          </p>
        </section>

        <section className="panel flex h-full min-w-0 flex-col gap-4" aria-label="Live discovery preview">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="section-title">Live preview</h2>
              <p className="section-subtitle mt-0.5 truncate">{active.label}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className={`gap-1.5 font-normal ${tone}`}>
                {isLoading && <RefreshCw className="size-3 animate-spin" />}
                {isLoading ? "Running" : failed ? "Failed" : result && lensRan ? "Live" : "Waiting"}
              </Badge>
              <Button
                variant="outline"
                size="icon-xs"
                onClick={() => runLens(activeIndex)}
                disabled={isLoading}
                aria-label="Refresh discovery query"
              >
                <RefreshCw className={`size-3 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          <QueryCodeBlock
            code={active.query}
            maxHeight="5.5rem"
            className="whitespace-pre-wrap break-words"
          />

          {isLoading && !result ? (
            <div className="grid grid-cols-2 gap-2" aria-busy="true">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="mt-2 h-4 w-20" />
                </div>
              ))}
            </div>
          ) : failed ? (
            <div className="rounded-lg border border-red-500/25 bg-red-500/[0.05] px-3 py-3">
              <p className="text-[11.5px] font-medium text-red-700 dark:text-red-300">
                {state.error?.code} · {state.error?.message}
              </p>
              {state.error?.detail && (
                <p className="mt-1 line-clamp-3 break-all font-mono text-[10px] leading-relaxed text-red-700/80 dark:text-red-300/80">
                  {state.error.detail}
                </p>
              )}
              <Button
                variant="outline"
                size="xs"
                className="mt-2.5 gap-1.5"
                onClick={() => runLens(activeIndex)}
              >
                <RefreshCw className="size-3" />
                Retry
              </Button>
            </div>
          ) : result && lensRan ? (
            <>
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  {
                    label: "Matching",
                    value: result.count === null ? "—" : formatInteger(result.count),
                  },
                  { label: "Rows", value: formatInteger(result.entities.length) },
                  { label: "Block", value: formatBlock(result.blockNumber) },
                  { label: "Round trip", value: formatDuration(result.durationMs) },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg border border-border/60 bg-background/40 px-3 py-2"
                  >
                    <dt className="stat-label">{item.label}</dt>
                    <dd className="stat-value mt-1 truncate">{item.value}</dd>
                  </div>
                ))}
              </dl>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="stat-label">Detected fields</span>
                  <span className="text-[10px] text-muted-foreground">
                    {fields.length} {pluralize(fields.length, "field")}
                  </span>
                </div>
                {attributeFields.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/70 px-3 py-2.5 text-[11.5px] text-muted-foreground">
                    No attribute fields in this page of results.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {attributeFields.slice(0, 8).map((field) => (
                      <span
                        key={field.name}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/60 bg-background/40 px-1.5 py-1"
                      >
                        <span className="truncate font-mono text-[10px] text-foreground/90">
                          {field.name}
                        </span>
                        <TypeBadge type={field.type} />
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="min-h-0 flex-1">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="stat-label">Entities</span>
                  <span className="text-[10px] text-muted-foreground">
                    {result.entities.length === 0
                      ? "none matched"
                      : `showing ${Math.min(8, result.entities.length)} of ${result.entities.length}`}
                  </span>
                </div>
                {result.entities.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center text-[11.5px] text-muted-foreground">
                    This lens matched no entities at block {formatBlock(result.blockNumber)}.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {result.entities.slice(0, 8).map((entity) => {
                      const sample = Object.entries(entity.attributes)[0];
                      return (
                        <li key={entity.key}>
                          <button
                            type="button"
                            onClick={() => setSelected(entity)}
                            className="flex w-full items-center gap-2 rounded-md border border-border/50 bg-background/30 px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-background/60"
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
                            <ArrowUpRight className="size-3 shrink-0 text-muted-foreground" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                <p className="text-[10.5px] text-muted-foreground">
                  Read {formatRelativeTime(result.fetchedAt, now)} · limit {DISCOVERY_LIMIT}
                </p>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="xs" asChild className="gap-1.5">
                    <Link href="/dashboards/new">
                      <FolderPlus className="size-3" />
                      New dashboard
                    </Link>
                  </Button>
                  <Button size="xs" asChild className="gap-1.5">
                    <Link href={queryHref}>
                      Open in query builder
                      <ArrowUpRight className="size-3" />
                    </Link>
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 px-4 py-10 text-center">
              <Compass className="size-5 text-muted-foreground" />
              <p className="text-[12px] text-muted-foreground">
                Select a lens to query the keyspace.
              </p>
            </div>
          )}
        </section>
      </div>

      <section className="panel flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background/40 text-muted-foreground">
            <Globe2 className="size-4" />
          </span>
          <div>
            <h2 className="section-title">Shared dashboard gallery is not available yet</h2>
            <p className="section-subtitle mt-1 max-w-2xl leading-relaxed">
              Dashboards in ARKIV VIZ are stored in this browser only. There is no publishing or
              discovery backend, so this page does not list community dashboards — everything above
              is live Arkiv data, not sample content.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:pl-4">
          <ConnectionBadge />
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboards">My dashboards</Link>
          </Button>
        </div>
      </section>

      <EntityDetailDialog
        entity={selected}
        blockNumber={result?.blockNumber ?? null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
