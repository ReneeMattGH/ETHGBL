import type { Metadata } from "next";
import { Suspense } from "react";
import { ConnectionBadge, RealDataIndicator } from "@/components/network/connection-badge";
import { QueryWorkbench } from "@/components/query/query-workbench";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Query Builder",
  description: "Write and execute Arkiv queries against the live Rabdi network.",
};

async function QueryWorkbenchFromParams({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; limit?: string }>;
}) {
  const params = await searchParams;
  const initialLimit = params.limit ? Number(params.limit) : undefined;
  return <QueryWorkbench initialQuery={params.query} initialLimit={initialLimit} />;
}

function WorkbenchFallback() {
  return (
    <div className="space-y-5">
      <div className="panel space-y-3">
        <div className="grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <Skeleton className="h-80 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  );
}

export default function QueryPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; limit?: string }>;
}) {
  return (
    <div>
      <PageHeader
        title="Query Builder"
        description="Connect to Arkiv and explore your entities."
        actions={
          <>
            <RealDataIndicator />
            <ConnectionBadge />
          </>
        }
      />

      <Suspense fallback={<WorkbenchFallback />}>
        <QueryWorkbenchFromParams searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
