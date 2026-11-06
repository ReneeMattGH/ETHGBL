import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Database, LineChart, Plus, RefreshCw } from "lucide-react";
import { ConnectionPanel } from "@/components/network/connection-panel";
import { OverviewHero } from "@/components/overview/overview-hero";
import { RecentDashboards } from "@/components/overview/recent-dashboards";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Overview",
};

const STEPS = [
  {
    icon: Database,
    title: "Run a real query",
    body: "Send an Arkiv predicate to the live node. You get actual entities, typed attributes, ownership and block metadata.",
  },
  {
    icon: LineChart,
    title: "Compose from returned fields",
    body: "Charts and metrics can only use fields present in the response. Aggregations disclose how many rows they sampled.",
  },
  {
    icon: RefreshCw,
    title: "Keep the view live",
    body: "Saved dashboards re-run on a polling interval, with manual refresh, freshness state and last-good-data recovery.",
  },
] as const;

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Turn Arkiv entities into live, shareable dashboards."
        actions={
          <Button asChild className="gap-1.5">
            <Link href="/dashboards/new">
              <Plus className="size-4" />
              Create Dashboard
            </Link>
          </Button>
        }
      />

      <OverviewHero />

      <ConnectionPanel layout="strip" />

      <RecentDashboards />

      <section aria-labelledby="getting-started" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="getting-started" className="section-title">
              Getting started
            </h2>
            <p className="section-subtitle mt-0.5">
              A query-to-dashboard flow built on real network reads.
            </p>
          </div>
          <Button variant="ghost" size="xs" asChild className="gap-1 text-muted-foreground">
            <Link href="/explore">
              Explore the keyspace
              <ArrowRight className="size-3" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <article key={step.title} className="panel">
              <div className="flex items-center justify-between">
                <div className="flex size-8 items-center justify-center rounded-md border border-border/70 bg-background/50 text-primary">
                  <step.icon className="size-4" />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">0{index + 1}</span>
              </div>
              <h3 className="mt-3 text-[12.5px] font-medium text-foreground">{step.title}</h3>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-[10px] text-muted-foreground">
        <span>
          Official SDK <code className="font-mono">@arkiv-network/sdk 1.0.1</code> · Rabdi Testnet ·
          chain 7794095
        </span>
        <span>Dashboards persist in this browser only · no account or backend</span>
      </footer>
    </div>
  );
}
