"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, LayoutDashboard, Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useNow } from "@/hooks/use-now";
import { useDashboards } from "@/lib/dashboard/store";
import { VISUALIZATION_META } from "@/lib/dashboard/types";
import { formatRelativeTime } from "@/lib/format";
import { formatRefreshInterval } from "@/lib/settings";

export function RecentDashboards() {
  const { dashboards, hydrated } = useDashboards();
  const now = useNow(true, 30_000);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="section-title">Recent dashboards</h2>
          {hydrated && dashboards.length > 0 && (
            <span className="text-[10.5px] text-muted-foreground">
              {dashboards.length} saved locally
            </span>
          )}
        </div>
        {dashboards.length > 0 && (
          <Button variant="ghost" size="xs" asChild className="gap-1 text-muted-foreground">
            <Link href="/dashboards">
              View all
              <ArrowRight className="size-3" />
            </Link>
          </Button>
        )}
      </div>

      {!hydrated ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="panel space-y-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-2.5 w-32" />
            </div>
          ))}
        </div>
      ) : dashboards.length === 0 ? (
        <EmptyState
          icon={LayoutDashboard}
          title="No dashboards yet"
          className="py-10"
          description="Run a query against the live network, choose a visualization from the fields that come back, then save the layout here."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild className="gap-1.5">
                <Link href="/dashboards/new">
                  <Plus className="size-4" />
                  Create your first dashboard
                </Link>
              </Button>
              <Button asChild variant="outline" className="gap-1.5">
                <Link href="/query">Explore the query builder</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {dashboards.slice(0, 3).map((dashboard) => (
            <article
              key={dashboard.id}
              className="panel flex flex-col gap-3 transition-colors hover:border-border/90"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/dashboards/${dashboard.id}`}
                    className="block truncate text-[13px] font-medium text-foreground hover:underline"
                  >
                    {dashboard.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Badge variant="outline" className="h-4 px-1.5 font-mono text-[9px]">
                      {dashboard.network}
                    </Badge>
                    <span className="inline-flex items-center gap-1">
                      <RefreshCw className="size-2.5" />
                      {formatRefreshInterval(dashboard.refreshIntervalMs)}
                    </span>
                    <span className="text-border">·</span>
                    <span>{dashboard.widgets.length} widgets</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon-xs" asChild>
                  <Link href={`/dashboards/${dashboard.id}`} aria-label={`Open ${dashboard.name}`}>
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                </Button>
              </div>

              <pre className="line-clamp-2 overflow-hidden rounded-md border border-border/60 bg-background/40 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                {dashboard.query.text}
              </pre>

              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5">
                <div className="flex flex-wrap gap-1">
                  {dashboard.widgets.slice(0, 3).map((widget) => (
                    <Badge
                      key={widget.id}
                      variant="secondary"
                      className="h-4 px-1.5 text-[9px] font-normal"
                    >
                      {VISUALIZATION_META[widget.type].label}
                    </Badge>
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {formatRelativeTime(dashboard.updatedAt, now)}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
