import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardBuilder } from "@/components/dashboard/dashboard-builder";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Create dashboard",
  description: "Build a dashboard from a live Arkiv query.",
};

async function BuilderFromParams({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; limit?: string }>;
}) {
  const params = await searchParams;
  const initialLimit = params.limit ? Number(params.limit) : undefined;
  return <DashboardBuilder initialQuery={params.query} initialLimit={initialLimit} />;
}

function BuilderFallback() {
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

export default function NewDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; limit?: string }>;
}) {
  return (
    <div>
      <PageHeader
        title="Create dashboard"
        description="Name the view, verify the query, then compose widgets from the fields the live result actually returned."
      />
      <Suspense fallback={<BuilderFallback />}>
        <BuilderFromParams searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
