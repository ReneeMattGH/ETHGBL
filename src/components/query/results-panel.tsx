"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  FolderPlus,
  Play,
  RefreshCw,
  Table2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import type { EntityDto, QueryErrorDto, QueryResultDto } from "@/lib/arkiv/types";
import { formatBlock, formatDateTime, formatDuration, formatInteger, pluralize } from "@/lib/format";
import { inferFields } from "@/lib/visualization/fields";
import { EntitiesTable } from "./entities-table";
import { EntityDetailDialog } from "./entity-detail-dialog";
import { FieldsPanel } from "./fields-panel";
import { QueryErrorPanel } from "./query-error-panel";
import { RequestPanel } from "./request-panel";

const PAGE_SIZE_NOTE =
  "Arkiv nodes return at most 100 entities per page. Offset pagination is stable only when the query has a deterministic ORDER BY (for example $key:key ASC).";

function LoadingSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Executing query">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/70 bg-border/60 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="bg-card px-4 py-3">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="mt-2 h-4 w-24" />
          </div>
        ))}
      </div>
      <div className="space-y-2 rounded-xl border border-border/70 p-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
      <p className="text-[11.5px] text-muted-foreground">
        Query is running against the Arkiv node — results are never filled in locally.
      </p>
    </div>
  );
}

export function ResultsPanel({
  status,
  result,
  error,
  queryDirty,
  onRetry,
  onPageChange,
  onCreateDashboard,
}: {
  status: "idle" | "loading" | "success" | "error";
  result: QueryResultDto | null;
  error: QueryErrorDto | null;
  queryDirty: boolean;
  onRetry: () => void;
  onPageChange: (offset: number) => void;
  onCreateDashboard?: (result: QueryResultDto) => void;
}) {
  const [selected, setSelected] = React.useState<EntityDto | null>(null);
  const resultKey = result ? `${result.fetchedAt}:${result.request.offset}` : null;

  React.useEffect(() => {
    setSelected(null);
  }, [resultKey]);

  const fields = React.useMemo(() => inferFields(result?.entities ?? []), [result]);

  if (status === "idle" && !result) {
    return (
      <EmptyState
        icon={Play}
        title="No query executed yet"
        description="Write an Arkiv query above and execute it. Results, field types and block metadata come directly from the selected network — nothing is previewed locally."
        action={
          <Button size="sm" onClick={onRetry} className="gap-1.5">
            <Play className="size-3.5" />
            Execute query
          </Button>
        }
      />
    );
  }

  if (status === "loading" && !result) {
    return <LoadingSkeleton />;
  }

  if (status === "error" && !result) {
    return <QueryErrorPanel error={error ?? { code: "INTERNAL", message: "Unknown error.", retryable: true }} onRetry={onRetry} />;
  }

  if (!result) return null;

  const page = Math.floor(result.request.offset / result.request.limit);
  const firstRow = result.entities.length === 0 ? 0 : result.request.offset + 1;
  const lastRow = result.request.offset + result.entities.length;
  const total = result.count === null ? null : Number(result.count);
  const hasNext =
    total === null
      ? result.entities.length === result.request.limit
      : lastRow < total;
  const canPrev = result.request.offset > 0;

  return (
    <div className="space-y-3">
      {error && (
        <QueryErrorPanel
          compact
          title="Latest request failed — showing previous successful result"
          error={error}
          onRetry={onRetry}
        />
      )}

      {queryDirty && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-[11.5px] text-amber-800 dark:text-amber-200">
          <RefreshCw className="size-3.5 shrink-0" />
          The editor has changed since this result was fetched. Run the query again to refresh it.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-card/40 px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Database className="size-3.5 text-muted-foreground" />
          <span className="text-[12px] font-medium text-foreground">
            {result.entities.length === 0
              ? "No entities returned"
              : `${formatInteger(result.entities.length)} ${pluralize(result.entities.length, "entity", "entities")} on this page`}
          </span>
          <Badge
            variant="outline"
            className="gap-1.5 border-emerald-500/25 bg-emerald-500/10 font-normal text-emerald-700 dark:text-emerald-300"
          >
            <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-emerald-400" />
            {result.network.label} · live node data
          </Badge>
          <span className="text-[10.5px] text-muted-foreground">
            block {formatBlock(result.blockNumber)} · {formatDuration(result.durationMs)} ·{" "}
            {formatDateTime(result.fetchedAt)}
          </span>
        </div>
        {onCreateDashboard && (
          <Button
            size="xs"
            variant="secondary"
            className="gap-1.5"
            onClick={() => onCreateDashboard(result)}
            disabled={result.entities.length === 0}
          >
            <FolderPlus className="size-3.5" />
            Create dashboard
          </Button>
        )}
      </div>

      <Tabs defaultValue="entities">
        <TabsList variant="line" className="w-full justify-start border-b border-border/60 pb-1">
          <TabsTrigger value="entities">
            <Table2 className="size-3.5" />
            Entities
            <Badge variant="secondary" className="ml-1 h-4 px-1 font-mono text-[9.5px]">
              {result.entities.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="fields">
            Fields
            <Badge variant="secondary" className="ml-1 h-4 px-1 font-mono text-[9.5px]">
              {fields.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="request">Request</TabsTrigger>
        </TabsList>

        <TabsContent value="entities" className="mt-3 space-y-3">
          {result.entities.length === 0 ? (
            <EmptyState
              icon={Database}
              title="The query executed successfully but matched no entities"
              description="The node returned zero rows at this block. Broaden the predicate, remove filters, or try the “All live entities” example to confirm the namespace is populated."
            />
          ) : (
            <>
              <EntitiesTable
                entities={result.entities}
                fields={fields}
                blockNumber={result.blockNumber}
                onSelect={setSelected}
                showCreator
                showUpdated
                resetKey={resultKey ?? undefined}
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  Showing rows {formatInteger(firstRow)}–{formatInteger(lastRow)}
                  {total === null ? "" : ` of ${formatInteger(total)}`} · page {formatInteger(page + 1)}
                  {total === null ? "" : ` of ${formatInteger(Math.max(1, Math.ceil(total / result.request.limit)))}`}
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="xs"
                    variant="outline"
                    className="gap-1"
                    onClick={() => onPageChange(Math.max(0, result.request.offset - result.request.limit))}
                    disabled={!canPrev}
                  >
                    <ChevronLeft className="size-3.5" />
                    Previous
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    className="gap-1"
                    onClick={() => onPageChange(result.request.offset + result.request.limit)}
                    disabled={!hasNext}
                  >
                    Next
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              </div>
              <p className="text-[10.5px] text-muted-foreground">{PAGE_SIZE_NOTE}</p>
            </>
          )}
        </TabsContent>

        <TabsContent value="fields" className="mt-3">
          <FieldsPanel fields={fields} entityCount={result.entities.length} />
        </TabsContent>

        <TabsContent value="request" className="mt-3">
          <RequestPanel result={result} />
        </TabsContent>
      </Tabs>

      <EntityDetailDialog
        entity={selected}
        blockNumber={result.blockNumber}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
