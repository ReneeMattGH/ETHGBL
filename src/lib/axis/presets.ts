import type { AxisWidget, DashboardDocument, Filters } from "./model";

export function advancedUsdcDashboard(datasetKey: string): DashboardDocument {
  const widget = (id: string, title: string, kind: AxisWidget["kind"], metric: AxisWidget["metric"], grouping: AxisWidget["grouping"] = "time", width: 1 | 2 = 1, extra: Filters = {}): AxisWidget => ({ id, title, kind, metric, grouping, width, query: { datasetKey, filters: { lookbackBlocks: "60", ...extra } } });
  return { version: 1, preset: "usdc-activity-v1", title: "Polygon USDC · Advanced Activity", description: "Live analytics over the latest 60 verified source blocks. Real Polygon native USDC transfers are mirrored into Arkiv; all widgets query Arkiv and refresh every 30 seconds. Coverage and ingestion lag are shown explicitly.", refreshMs: 30000, widgets: [
    widget("volume", "Gross transfer volume", "metric", "amount"),
    widget("count", "Transfer activity", "metric", "transfers"),
    widget("wallets", "Active wallets", "metric", "uniqueWallets"),
    widget("median", "Typical transfer size", "metric", "medianAmount"),
    widget("p90", "90th percentile transfer", "metric", "p90Amount"),
    widget("largest", "Largest observed transfer", "metric", "largestAmount"),
    widget("volume-block", "USDC volume by source block", "line", "amount", "block", 2),
    widget("activity-block", "Transfers by source block", "line", "transfers", "block", 2),
    widget("senders", "Top sending wallets by USDC volume", "bar", "amount", "sender"),
    widget("recipients", "Top receiving wallets by USDC volume", "bar", "amount", "recipient"),
    widget("distribution", "Transfer-size distribution", "bar", "transfers", "distribution", 2),
    widget("latest", "Latest verified transfers", "table", "transfers", "time", 2),
  ] };
}
