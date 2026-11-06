"use client";
import type { SavedDocument } from "@/lib/axis/model";
import { useApi, Notice, Loading, PageIntro } from "./shared";
import { DashboardView } from "./dashboards";

export function PrebuiltDashboard() {
  const resource = useApi<{ dashboard: SavedDocument | null }>("prebuilt", 30000);
  if (resource.error) return <Notice tone="error">{resource.error}</Notice>;
  if (!resource.data) return <Loading />;
  if (!resource.data.dashboard) return <><PageIntro title="Advanced USDC analytics" description="A prebuilt dashboard backed by a continuously refreshed Arkiv dataset." /><Notice>The preset has not been published yet. Run <code>npm.cmd run dashboard:seed</code> with the local worker running.</Notice></>;
  return <DashboardView entityKey={resource.data.dashboard.key} />;
}
