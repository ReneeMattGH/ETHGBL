"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Clock,
  Copy,
  LayoutDashboard,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryCodeBlock } from "@/components/query/query-editor";
import { QueryErrorPanel } from "@/components/query/query-error-panel";
import { ConnectionBadge } from "@/components/network/connection-badge";
import { useNetworkStatus } from "@/components/providers/network-status-provider";
import { useCopy } from "@/hooks/use-copy";
import { deriveFreshness, useLiveQuery } from "@/hooks/use-live-query";
import { useNow } from "@/hooks/use-now";
import { deleteDashboard, useDashboard } from "@/lib/dashboard/store";
import { VISUALIZATION_META } from "@/lib/dashboard/types";
import { formatBlock, formatInteger, formatRelativeTime } from "@/lib/format";
import { formatRefreshInterval } from "@/lib/settings";
import { inferFields } from "@/lib/visualization/fields";
import { DashboardWidget, WidgetSkeleton } from "./dashboard-widget";

const FRESHNESS_TONE: Record<string, string> = {
  live: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  stale: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  paused: "border-border bg-muted/40 text-muted-foreground",
  error: "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300",
  connecting: "border-border bg-muted/40 text-muted-foreground",
};

export function DashboardView({ id }: { id: string }) {
  const router = useRouter();
  const { copy, copiedKey } = useCopy();
  const { dashboard, hydrated } = useDashboard(id);
  const networkStatus = useNetworkStatus();
  const live = useLiveQuery({
    query: dashboard?.query.text ?? "",
    limit: dashboard?.query.limit ?? 50,
    intervalMs: dashboard?.refreshIntervalMs ?? 0,
    enabled: Boolean(dashboard),
    network: dashboard?.network ?? "rabdi",
  });
  const now = useNow(true, 1_000);
  const freshness = deriveFreshness(live, dashboard?.refreshIntervalMs ?? 0, now);
  const fields = React.useMemo(() => inferFields(live.result?.entities ?? []), [live.result]);

  if (!hydrated) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="panel space-y-3 md:col-span-1">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-40 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <EmptyState
        icon={LayoutDashboard}
        title="Dashboard not found"
        description="This dashboard is not in this browser's local storage. Dashboards are persisted per browser and are not synced to a server, so a different device or a cleared storage will not have it."
        action={
          <Button asChild>
            <Link href="/dashboards">Back to dashboards</Link>
          </Button>
        }
      />
    );
  }

  const result = live.result;
  const freshnessLabel: Record<string, string> = {
    live: live.isRefreshing ? "Refreshing" : "Live",
    stale: "Stale",
    paused: "Manual",
    error: "Refresh failed",
    connecting: "Connecting",
  };

  const queryHref = `/query?${new URLSearchParams({
    query: dashboard.query.text,
    limit: String(dashboard.query.limit),
    network: dashboard.network,
  }).toString()}`;

  const latestObservedBlock = (() => {
    const blocks: bigint[] = [];
    if (result?.blockNumber) {
      try {
        blocks.push(BigInt(result.blockNumber));
      } catch {}
    }
    if (networkStatus.connected && networkStatus.status?.blockNumber) {
      try {
        blocks.push(BigInt(networkStatus.status.blockNumber));
      } catch {}
    }
    if (blocks.length === 0) return null;
    return blocks.reduce((latest, block) => (block > latest ? block : latest));
  })();

  return (
    <div className="space-y-5">
      <div>
        <Button
          variant="ghost"
          size="xs"
          asChild
          className="mb-2 -ml-1.5 gap-1 text-muted-foreground"
        >
          <Link href="/dashboards">
            <ArrowLeft className="size-3" />
            My Dashboards
          </Link>
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[1.4375rem] font-semibold leading-tight tracking-[-0.022em] text-foreground sm:text-[1.5625rem]">
              {dashboard.name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <Badge variant="outline" className="h-4 px-1.5 font-mono text-[9px]">
                {dashboard.network}
              </Badge>
              <span>{dashboard.widgets.length} widgets</span>
              <span className="text-border">·</span>
              <span>polling {formatRefreshInterval(dashboard.refreshIntervalMs)}</span>
              <span className="text-border">·</span>
              <span>saved {formatRelativeTime(dashboard.updatedAt, now)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <ConnectionBadge />
            <Badge variant="outline" className={FRESHNESS_TONE[freshness]}>
              <span
                aria-hidden="true"
                className={`inline-block size-1.5 rounded-full ${
                  freshness === "live"
                    ? "bg-emerald-400"
                    : freshness === "stale"
                      ? "bg-amber-400"
                      : freshness === "error"
                        ? "bg-red-400"
                        : "bg-muted-foreground"
                }`}
              />
              {freshnessLabel[freshness]}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={live.refresh}
              disabled={live.isLoading}
            >
              <RefreshCw className={`size-3.5 ${live.isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" variant="outline" asChild className="gap-1.5">
              <Link href={`/dashboards/${dashboard.id}/edit`}>
                <Pencil className="size-3.5" />
                Edit
              </Link>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete “{dashboard.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The saved query and layout will be removed from this browser. Arkiv entities are
                    unaffected.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => {
                      try {
                        deleteDashboard(dashboard.id);
                        toast.success("Dashboard deleted");
                        router.push("/dashboards");
                      } catch (error) {
                        toast.error("Could not delete dashboard", {
                          description: error instanceof Error ? error.message : undefined,
                        });
                      }
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      <section className="panel space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="eyebrow">Executed query</p>
            <p className="mt-1 text-[10.5px] text-muted-foreground">
              Limit {formatInteger(dashboard.query.limit)} ·{" "}
              {result ? `read at block ${formatBlock(result.blockNumber)}` : "waiting for first result"}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="xs"
              className="gap-1.5 text-muted-foreground"
              onClick={() => void copy(dashboard.query.text, "Query copied")}
            >
              <Copy className="size-3" />
              {copiedKey === dashboard.query.text ? "Copied" : "Copy"}
            </Button>
            <Button variant="outline" size="xs" asChild className="gap-1.5">
              <Link href={queryHref}>
                Open in query builder
                <ArrowUpRight className="size-3" />
              </Link>
            </Button>
          </div>
        </div>

        <QueryCodeBlock
          code={dashboard.query.text}
          maxHeight="6rem"
          className="whitespace-pre-wrap break-words"
        />

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {[
            {
              label: "Matching entities",
              value: result?.count ? formatInteger(result.count) : "—",
            },
            {
              label: "Rows loaded",
              value: result ? formatInteger(result.entities.length) : "—",
            },
            {
              label: "Read at block",
              value: result ? formatBlock(result.blockNumber) : "—",
            },
            {
              label: "Latest observed block",
              value: latestObservedBlock ? formatBlock(latestObservedBlock.toString()) : "—",
            },
            {
              label: "Last success",
              value: live.lastSuccessAt ? formatRelativeTime(live.lastSuccessAt, now) : "—",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 last:col-span-2 sm:last:col-span-1"
            >
              <dt className="stat-label">{item.label}</dt>
              <dd className="stat-value mt-1 truncate text-[13px] text-foreground">{item.value}</dd>
            </div>
          ))}
        </dl>

        {live.failureCount > 0 && (
          <p className="flex items-center gap-1.5 text-[10.5px] text-amber-700 dark:text-amber-300">
            <Clock className="size-3" />
            {live.failureCount} consecutive failed {live.failureCount === 1 ? "attempt" : "attempts"}.
            {result ? " Showing the last successful data." : ""}
          </p>
        )}
      </section>

      {live.error && !result && (
        <QueryErrorPanel
          error={live.error}
          onRetry={live.refresh}
          title="The dashboard query has not succeeded yet"
        />
      )}

      {live.error && result && (
        <QueryErrorPanel
          compact
          error={live.error}
          onRetry={live.refresh}
          title="Latest refresh failed — widgets keep the last successful data"
        />
      )}

      <section aria-label="Dashboard widgets">
        {live.isInitialLoading ? (
          <div className="grid items-stretch gap-3 md:grid-cols-3">
            {dashboard.widgets.map((widget) => (
              <WidgetSkeleton key={widget.id} width={widget.width} />
            ))}
          </div>
        ) : result ? (
          <div
            className={`grid items-stretch gap-3 md:grid-cols-3 ${
              live.isRefreshing ? "opacity-90" : ""
            }`}
          >
            {dashboard.widgets.map((widget) => (
              <div
                key={widget.id}
                className={`flex min-w-0 ${widget.width === 1 ? "md:col-span-1" : widget.width === 2 ? "md:col-span-2" : "md:col-span-3"}`}
              >
                <DashboardWidget
                  widget={widget}
                  entities={result.entities}
                  fields={fields}
                  totalCount={result.count}
                  blockNumber={result.blockNumber}
                  queryLimit={result.request.limit}
                />
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-[10.5px] text-muted-foreground">
        <span>
          Polling via <code className="font-mono">arkiv_query</code> · data fetched{" "}
          {result ? formatRelativeTime(result.fetchedAt, now) : "—"} · every{" "}
          {formatRefreshInterval(dashboard.refreshIntervalMs)} ·{" "}
          <code className="font-mono">{result?.rpcHost ?? "rabdi"}</code>
        </span>
        <span className="flex flex-wrap items-center gap-1">
          {dashboard.widgets.map((widget) => (
            <Badge key={widget.id} variant="secondary" className="h-4 px-1.5 text-[9px] font-normal">
              {VISUALIZATION_META[widget.type].label}
            </Badge>
          ))}
        </span>
      </footer>
    </div>
  );
}
