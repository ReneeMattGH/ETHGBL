"use client";

import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboard } from "@/lib/dashboard/store";
import { DashboardBuilder } from "./dashboard-builder";

export function DashboardEditor({ id }: { id: string }) {
  const { dashboard, hydrated } = useDashboard(id);

  if (!hydrated) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="space-y-4">
            <Skeleton className="h-64 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <EmptyState
        icon={LayoutDashboard}
        title="Dashboard not found"
        description="This dashboard is not in this browser's local storage, so there is nothing to edit. Dashboards are persisted per browser and are not synced to a server."
        action={
          <Button asChild>
            <Link href="/dashboards">Back to dashboards</Link>
          </Button>
        }
      />
    );
  }

  return <DashboardBuilder editing={dashboard} />;
}
