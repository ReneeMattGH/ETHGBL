import type { AxisWidget, DashboardDocument, QueryDefinition } from "./model";
import { validateDashboard, validateFilters, validateQuerySources } from "./core";
import { keccak256, stringToHex } from "viem";

export const dashboardFingerprint = (document: DashboardDocument) => keccak256(stringToHex(JSON.stringify(validateDashboard(document))));

export const DASHBOARD_DRAFT_KEY = "axis:dashboard-draft:v1";
export function normalizeDashboard(doc: DashboardDocument): DashboardDocument {
  const normalize = (query: QueryDefinition): QueryDefinition => ({ ...query, filters: validateFilters(query.filters), ...(query.queries ? { queries: validateQuerySources(query.queries) } : {}) });
  return { ...doc, ...(doc.query ? { query: normalize(doc.query) } : {}), widgets: doc.widgets.map(widget => ({ ...widget, query: normalize(widget.query) })) };
}
export function dashboardStarter(query: QueryDefinition): AxisWidget[] {
  const visual = (id: string, title: string, description: string, kind: AxisWidget["kind"], metric: AxisWidget["metric"], grouping: AxisWidget["grouping"], width: 1 | 2): AxisWidget => ({ id, title, description, kind, metric, grouping, width, interval: "day", query });
  return [
    visual("volume", "Transferred USDC", "Gross volume across every matching transfer.", "metric", "amount", "block", 1),
    visual("transfers", "Transfers", "Verified transfer records in the current filter scope.", "metric", "transfers", "block", 1),
    visual("wallets", "Active wallets", "Distinct senders and recipients, counted as a union.", "metric", "uniqueWallets", "block", 1),
    visual("median", "Median transfer", "The middle transfer size, using exact token amounts.", "metric", "medianAmount", "block", 1),
    visual("activity", "Transfer activity", "How USDC volume and transfer-size composition change across observed blocks.", "stacked-area", "amount", "block", 2),
    visual("concentration", "Wallet concentration", "Sending wallets ranked by gross transferred USDC. Remaining wallets are grouped as Other.", "ranked", "amount", "sender", 1),
    visual("allocation", "Volume by transfer size", "The share of transferred USDC contributed by each transfer-size band.", "treemap", "amount", "distribution", 1),
    visual("intensity", "Activity intensity", "Transfer counts by observed block and transfer-size band. Missing blocks are not invented.", "heatmap", "transfers", "block", 2),
  ];
}
export function moveVisual(widgets: AxisWidget[], from: number, to: number) {
  if (from < 0 || from >= widgets.length || to < 0 || to >= widgets.length || from === to) return widgets;
  const next = [...widgets], [widget] = next.splice(from, 1);
  next.splice(to, 0, widget);
  return next;
}
