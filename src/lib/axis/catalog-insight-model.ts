export type CatalogInsightChart = { title: string; kind: "line" | "bar" | "horizontal" | "stacked-area" | "share-area" | "treemap" | "donut" | "ranked" | "heatmap" | "flow" | "matrix"; unit: string; decimals: number; dimensions?: { source: string; target: string }; series?: { id: string; label: string }[]; points: { label: string; value: string; values?: string[] }[] };
export type CatalogInsights = {
  entryId: string; status: "available" | "not-indexed";
  metrics: { label: string; value: string }[]; charts: CatalogInsightChart[];
  source?: { name: string; table: string; fromBlock?: string; throughBlock?: string; fetchedAt: string; executedQuery: string };
};
