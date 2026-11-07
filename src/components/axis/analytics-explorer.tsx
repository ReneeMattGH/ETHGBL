"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Analytics, AxisWidget, QueryDefinition } from "@/lib/axis/model";
import { shareValue } from "@/lib/axis/chart-data";
import { AnalyticsChart } from "./charts";
import { ChartSettings } from "./chart-settings";

export function AnalyticsExplorer({ analytics, query }: { analytics: Analytics; query: QueryDefinition }) {
  const [widget, setWidget] = React.useState<AxisWidget>({ id: "visual-analytics", title: "Transfer activity", kind: "stacked-area", metric: "amount", grouping: "block", width: 2, query });
  const current = { ...widget, query };
  const href = `/dashboards/new?${new URLSearchParams({ dataset: query.datasetKey, filters: JSON.stringify(query.filters), ...(query.queries ? { queries: JSON.stringify(query.queries) } : {}), chart: current.kind, measure: current.metric, grouping: current.grouping, interval: current.interval ?? "day", chartTitle: current.title })}`;
  const largest = [...analytics.distribution].sort((a, b) => BigInt(a.amountRaw) === BigInt(b.amountRaw) ? a.bucket.localeCompare(b.bucket) : BigInt(a.amountRaw) > BigInt(b.amountRaw) ? -1 : 1)[0];
  return <section className="axis-insights" aria-label="Visual analytics"><div className="axis-insights-heading"><h2>Visual analytics</h2><Link className="axis-inline-link" href={href}>Use in dashboard<ArrowUpRight size={14} /></Link></div>
    <div className="axis-visual-settings"><ChartSettings widget={current} onChange={setWidget} /></div>
    <div className="axis-insight-chart"><AnalyticsChart analytics={analytics} widget={current} /></div>
    <div className="axis-insight-facts"><div><span>Median transfer</span><strong>{analytics.medianAmount ?? "Unavailable"}<small> USDC</small></strong></div><div><span>P90 transfer</span><strong>{analytics.p90Amount ?? "Unavailable"}<small> USDC</small></strong></div><div><span>Active wallets</span><strong>{analytics.uniqueWallets.toLocaleString()}</strong></div></div>
    {analytics.transfers > 0 && <details className="axis-composition-insights" open><summary>Composition insights</summary><div className="axis-insights-composition"><section><h3>Transfer-size share by block</h3><AnalyticsChart analytics={analytics} widget={{ ...current, id: "size-share", title: "Transfer-size share by block", kind: "share-area", grouping: "block", metric: "amount" }} /></section><section><h3>Volume by transfer size</h3><AnalyticsChart analytics={analytics} widget={{ ...current, id: "size-donut", title: "Volume by transfer size", kind: "donut", grouping: "distribution", metric: "amount" }} /></section></div>{largest && <p className="axis-insight-summary"><b>{largest.bucket}</b> transfers account for <b>{shareValue(BigInt(largest.amountRaw), BigInt(analytics.amountRaw)).toFixed(2)}%</b> of the queried USDC volume.</p>}</details>}
    <details className="axis-chart-method"><summary>Calculation details</summary><p>Values cover the complete query. Coordinates are approximate; tooltips and exports retain exact values. Time buckets use UTC, and unobserved source blocks are not filled with activity.</p></details>
  </section>;
}
