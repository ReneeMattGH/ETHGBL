"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Database, RefreshCw } from "lucide-react";
import type { Dataset } from "@/lib/axis/model";
import { CHART_COLORS } from "@/lib/axis/chart-data";
import { useApi, type QueryResult } from "./shared";

const readableAmount = (value: string) => {
  const [whole, fraction] = value.split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction ? `.${fraction}` : "");
};

function PreviewState({ message, error = false }: { message: string; error?: boolean }) {
  return <div className="landing-preview-state" role={error ? "alert" : "status"}>
    <Database size={38} strokeWidth={1.4} aria-hidden="true" />
    <p>{message}</p>
    {error && <Link href="/explore">Explore datasets <ArrowUpRight size={16} /></Link>}
  </div>;
}

function VerifiedPreview({ dataset }: { dataset: Dataset }) {
  const datasetKey = dataset.key;
  const query = useApi<QueryResult>("query", 30000, { datasetKey, filters: {}, mode: "analytics", limit: 25 });
  const [measure, setMeasure] = React.useState<"amount" | "transfers">("transfers");
  const result = query.data, analytics = result?.analytics;
  const series = analytics?.blockSeries ?? [];
  const values = series.map(point => measure === "amount" ? Number(point.amount) : point.transfers);
  const max = Math.max(1, ...values);
  const bands = analytics?.distribution.map((bucket, band) => {
    const parts = series.map(point => {
      const composition = analytics.blockComposition?.find(item => item.blockNumber === point.blockNumber);
      const before = (composition?.buckets ?? []).slice(0, band).reduce((sum, item) => sum + (measure === "amount" ? Number(item.amount) : item.transfers), 0);
      const selected = composition?.buckets[band];
      return { before, value: selected ? measure === "amount" ? Number(selected.amount) : selected.transfers : 0 };
    });
    const x = (index: number) => 16 + index / Math.max(1, series.length - 1) * 468;
    const upper = parts.map((part, index) => `${x(index)},${144 - (part.before + part.value) / max * 116}`);
    const lower = parts.map((part, index) => `${x(index)},${144 - part.before / max * 116}`).reverse();
    return { label: bucket.bucket, polygon: [...upper, ...lower].join(" "), color: CHART_COLORS[band % CHART_COLORS.length], total: measure === "amount" ? bucket.amount : String(bucket.transfers) };
  }) ?? [];
  return <>
    <div className="landing-preview-heading"><h3>Onchain activity.</h3><button type="button" aria-label="Refresh live preview" onClick={query.refresh} disabled={query.loading}><RefreshCw size={22} className={query.loading ? "landing-refreshing" : ""} /></button></div>
    {!result && !query.error && <PreviewState message="Reading verified activity…" />}
    {!result && query.error && <PreviewState message="The live preview is temporarily unavailable." error />}
    {analytics && result && <>
      <div className="landing-preview-tabs" role="group" aria-label="Preview measure"><button aria-pressed={measure === "transfers"} onClick={() => setMeasure("transfers")}>Transfers</button><button aria-pressed={measure === "amount"} onClick={() => setMeasure("amount")}>Volume</button></div>
      <div className="landing-preview-value" data-testid="landing-live-value">{measure === "amount" ? readableAmount(analytics.amount) : analytics.transfers.toLocaleString("en-US")}</div>
      <p className="landing-preview-unit">{measure === "amount" ? "USDC transferred in this dataset" : "verified transfer events"}</p>
      {series.length ? <svg className="landing-data-plot" viewBox="0 0 500 170" role="img" aria-label={measure === "amount" ? "Verified USDC volume by source block" : "Verified transfer count by source block"}>
        <title>Verified Polygon activity, composed by actual transfer-size bands</title>
        {[28, 66, 105, 144].map(y => <line key={y} x1="0" x2="500" y1={y} y2={y} stroke="#e8e8e2" />)}
        {series.length > 1 ? bands.map(band => <polygon key={band.label} points={band.polygon} fill={band.color} fillOpacity={1} stroke="#fff" strokeWidth={.45}><title>{band.label}: {band.total} {measure === "amount" ? "USDC" : "transfers"}</title></polygon>) : bands.map((band, index) => <rect key={band.label} x={16 + bands.slice(0, index).reduce((sum, item) => sum + Number(item.total), 0) / (bands.reduce((sum, item) => sum + Number(item.total), 0) || 1) * 468} y={40} width={Number(band.total) / (bands.reduce((sum, item) => sum + Number(item.total), 0) || 1) * 468} height={90} rx={5} fill={band.color} fillOpacity={1}><title>{band.label}: {band.total} {measure === "amount" ? "USDC" : "transfers"}</title></rect>)}
      </svg> : <p className="landing-preview-empty">No transfers in this verified window.</p>}
      <details className="landing-preview-provenance"><summary>Dataset & query details</summary><dl><dt>Example source</dt><dd>Polygon mainnet · native USDC transfers</dd><dt>Storage</dt><dd>Arkiv Rabdi</dd><dt>Queried at</dt><dd>{new Date(result.fetchedAt).toISOString().slice(11, 19)} UTC</dd></dl><p>Queries refresh every 30 seconds. This example shows imported coverage, not the Polygon chain head. Chart positions are approximate; point tooltips show exact values.</p></details>
      {query.error && <p role="alert" className="landing-preview-warning">Refresh failed. Showing the last successful query.</p>}
    </>}
    <Link href={`/query?dataset=${datasetKey}`} className="landing-preview-link">Explore the data <ArrowUpRight size={22} /></Link>
  </>;
}

export function LandingPreview() {
  const catalog = useApi<{ datasets: Dataset[] }>("datasets", 60000);
  const dataset = catalog.data?.datasets.find(item => item.enabled && item.continuous) ?? catalog.data?.datasets.find(item => item.enabled);
  return <div className="landing-live-preview" aria-label="Live Arkiv analytics preview">
    {dataset ? <VerifiedPreview key={dataset.key} dataset={dataset} /> : <PreviewState message={catalog.error ? "The live preview is temporarily unavailable." : catalog.data ? "No public datasets are available yet." : "Opening the live dataset..."} error={!!catalog.error} />}
  </div>;
}
