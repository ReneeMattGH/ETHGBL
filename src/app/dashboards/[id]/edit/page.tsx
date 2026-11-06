import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DashboardEditor } from "@/components/dashboard/dashboard-editor";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Edit dashboard",
  description: "Update a saved ARKIV VIZ dashboard.",
};

function EditorFallback() {
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

async function EditorFromParams({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DashboardEditor id={id} />;
}

export default function EditDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div>
      <PageHeader
        eyebrow="My Dashboards"
        title="Edit dashboard"
        description="Adjust the name, query or widgets, then update the saved configuration. The live result is re-read from Arkiv before you can save."
        actions={
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link href="/dashboards">
              <ArrowLeft className="size-3.5" />
              Back to dashboards
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<EditorFallback />}>
        <EditorFromParams params={params} />
      </Suspense>
    </div>
  );
}
