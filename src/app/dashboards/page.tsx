import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { DashboardList } from "@/components/dashboard/dashboard-list";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "My Dashboards",
  description: "Saved ARKIV VIZ dashboards backed by live Arkiv queries.",
};

export default function DashboardsPage() {
  return (
    <div>
      <PageHeader
        title="My Dashboards"
        description="Saved queries, layouts and refresh intervals. Data is always re-read from the network — configurations never store cached rows."
        actions={
          <Button asChild className="gap-1.5">
            <Link href="/dashboards/new">
              <Plus className="size-4" />
              Create dashboard
            </Link>
          </Button>
        }
      />
      <DashboardList />
    </div>
  );
}
