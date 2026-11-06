import { Suspense } from "react";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { Skeleton } from "@/components/ui/skeleton";

function DashboardFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid gap-3 md:grid-cols-3">
        <Skeleton className="h-64 w-full rounded-xl md:col-span-1" />
        <Skeleton className="h-64 w-full rounded-xl md:col-span-2" />
      </div>
    </div>
  );
}

async function DashboardFromParams({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DashboardView id={id} />;
}

export default function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardFromParams params={params} />
    </Suspense>
  );
}
