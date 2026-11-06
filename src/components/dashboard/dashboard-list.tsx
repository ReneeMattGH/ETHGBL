"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  Clock,
  LayoutDashboard,
  Pencil,
  Plus,
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
import { useNow } from "@/hooks/use-now";
import { deleteDashboard, useDashboards } from "@/lib/dashboard/store";
import { VISUALIZATION_META, type DashboardConfig } from "@/lib/dashboard/types";
import { formatRelativeTime } from "@/lib/format";
import { formatRefreshInterval } from "@/lib/settings";

function DashboardCard({ dashboard, now }: { dashboard: DashboardConfig; now: number }) {
  return (
    <article className="panel group flex flex-col gap-3 transition-colors hover:border-border/90">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/dashboards/${dashboard.id}`}
            className="block truncate text-[13.5px] font-medium text-foreground hover:underline"
          >
            {dashboard.name}
          </Link>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
            <Badge variant="outline" className="h-4 px-1.5 font-mono text-[9px]">
              {dashboard.network}
            </Badge>
            <span className="inline-flex items-center gap-1">
              <RefreshCw className="size-2.5" />
              {formatRefreshInterval(dashboard.refreshIntervalMs)}
            </span>
            <span className="text-border">·</span>
            <span className="inline-flex items-center gap-1">
              <LayoutDashboard className="size-2.5" />
              {dashboard.widgets.length} {dashboard.widgets.length === 1 ? "widget" : "widgets"}
            </span>
          </p>
        </div>
        <Button variant="ghost" size="xs" asChild className="gap-1 text-muted-foreground">
          <Link href={`/dashboards/${dashboard.id}`} aria-label={`Open ${dashboard.name}`}>
            Open
            <ArrowUpRight className="size-3" />
          </Link>
        </Button>
      </div>

      <pre className="line-clamp-2 overflow-hidden rounded-md border border-border/60 bg-background/40 px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
        {dashboard.query.text}
      </pre>

      <div className="flex flex-wrap items-center gap-1">
        {dashboard.widgets.slice(0, 5).map((widget) => (
          <Badge
            key={widget.id}
            variant="secondary"
            className="h-5 gap-1 px-1.5 text-[9.5px] font-normal"
          >
            <BarChart3 className="size-2.5" />
            {VISUALIZATION_META[widget.type].label}
          </Badge>
        ))}
        {dashboard.widgets.length > 5 && (
          <span className="text-[10px] text-muted-foreground">+{dashboard.widgets.length - 5}</span>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
        <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
          <Clock className="size-2.5" />
          Updated {formatRelativeTime(dashboard.updatedAt, now)}
        </span>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon-xs" asChild className="text-muted-foreground">
            <Link
              href={`/dashboards/${dashboard.id}/edit`}
              aria-label={`Edit ${dashboard.name}`}
            >
              <Pencil className="size-3.5" />
            </Link>
          </Button>
          <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:text-destructive"
              aria-label={`Delete ${dashboard.name}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{dashboard.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the saved configuration from this browser. The underlying Arkiv data is
                untouched.
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
                  } catch (error) {
                    toast.error("Could not delete dashboard", {
                      description: error instanceof Error ? error.message : undefined,
                    });
                  }
                }}
              >
                Delete dashboard
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </div>
      </div>
    </article>
  );
}

export function DashboardList() {
  const { dashboards, hydrated } = useDashboards();
  const now = useNow(true, 30_000);

  if (!hydrated) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="panel space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-2.5 w-28" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-2.5 w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (dashboards.length === 0) {
    return (
      <EmptyState
        icon={LayoutDashboard}
        title="No dashboards saved yet"
        description="Build a dashboard by running a live Arkiv query, choosing a visualization from the fields the node actually returns, and saving the layout to this browser."
        action={
          <Button asChild className="gap-1.5">
            <Link href="/dashboards/new">
              <Plus className="size-4" />
              Create dashboard
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        {dashboards.length} saved {dashboards.length === 1 ? "dashboard" : "dashboards"} · stored in
        this browser · {dashboards.reduce((total, item) => total + item.widgets.length, 0)} widgets
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {dashboards.map((dashboard) => (
          <DashboardCard key={dashboard.id} dashboard={dashboard} now={now} />
        ))}
      </div>
    </div>
  );
}
