"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Database, Globe2, LayoutDashboard, Plus, Terminal, Wallet } from "lucide-react";
import type { Dataset, SavedDocument } from "@/lib/axis/model";
import { useApi, Panel, Notice, Empty, Loading } from "./shared";
import { useAxisWallet } from "./wallet";
import { DashboardCard, DatasetCard } from "./library-cards";

export function AxisOverview() {
  const dashboards = useApi<{ dashboards: SavedDocument[] }>("dashboards", 30000);
  const wallet = useAxisWallet(), owner = wallet.address?.toLowerCase();
  const datasets = useApi<{ datasets: Dataset[] }>(owner ? `datasets?owner=${owner}` : null, 30000);
  const ownedDatasets = (datasets.data?.datasets ?? [])
    .filter(dataset => dataset.owner.toLowerCase() === owner)
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const published = dashboards.data?.dashboards;
  const widgetCount = published?.reduce((total, dashboard) => total + dashboard.document.widgets.length, 0);
  return <div className="axis-overview">
    <section className="axis-overview-hero" aria-labelledby="axis-overview-title">
      <div className="axis-overview-hero-copy"><span className="axis-overview-hero-label"><Database size={14} />Built on Arkiv</span><h1 id="axis-overview-title">Your onchain<br />analytics workspace.</h1><p>Explore Polygon data. Turn your queries into dashboards.</p><Link href="/explore" className="axis-button axis-overview-explore">Explore data<ArrowRight size={17} /></Link></div>
      <div className="axis-overview-catalog"><span className="axis-overview-catalog-label"><Globe2 size={16} />Public catalog</span><dl><div><dt>Published dashboards</dt><dd>{published ? published.length.toLocaleString() : "—"}</dd></div><div><dt>Dashboard widgets</dt><dd>{widgetCount === undefined ? "—" : widgetCount.toLocaleString()}</dd></div></dl><span className="axis-overview-catalog-note">{dashboards.error ? (published ? "Last successful catalog read" : "Catalog unavailable") : published ? "From published Arkiv definitions" : "Reading from Arkiv…"}</span></div>
    </section>
    {dashboards.error && <Notice tone="error">{dashboards.error}</Notice>}
    <div className="axis-overview-actions"><Link className="axis-overview-action query" href="/query"><span className="axis-overview-action-icon"><Terminal size={21} /></span><span><b>Create a query</b><small>Find the data that matters</small></span><ArrowUpRight size={17} /></Link><Link className="axis-overview-action build" href="/dashboards/new"><span className="axis-overview-action-icon"><Plus size={22} /></span><span><b>Build a dashboard</b><small>Bring your analysis together</small></span><ArrowUpRight size={17} /></Link><Link className="axis-overview-action browse" href="/dashboards"><span className="axis-overview-action-icon"><LayoutDashboard size={20} /></span><span><b>Browse dashboards</b><small>Explore published insights</small></span><ArrowUpRight size={17} /></Link></div>
    <div className="axis-overview-collections">
    <Panel title="Public dashboards" className="axis-overview-public" actions={<Link className="axis-inline-link" href="/dashboards">View all<ArrowUpRight size={15} /></Link>}>
      {!dashboards.data && !dashboards.error ? <Loading /> : dashboards.data?.dashboards.length ? <div className="axis-overview-cards">{dashboards.data.dashboards.slice(0, 4).map(item => <DashboardCard key={item.key} dashboard={item} heading="h3" />)}</div> : !dashboards.error && <Empty>No published dashboards.</Empty>}
    </Panel>
    <Panel title="My datasets" className="axis-overview-personal" actions={<Link className="axis-inline-link" href="/datasets">View all<ArrowUpRight size={15} /></Link>}>
      {!owner ? <Empty><span className="axis-overview-wallet-icon"><Wallet size={26} strokeWidth={1.5} /></span><p>Connect your wallet to see your datasets.</p><button type="button" className="axis-button" disabled={wallet.busy} onClick={() => void wallet.connect().catch(() => {})}>{wallet.busy ? "Connecting..." : "Connect wallet"}<ArrowRight size={15} /></button></Empty> : <>
        {datasets.error && <Notice tone="error">{datasets.error}<button type="button" className="axis-link-button" disabled={datasets.loading} onClick={datasets.refresh}>Try again</button></Notice>}
        {!datasets.data && !datasets.error ? <Loading /> : datasets.data && (ownedDatasets.length ? <div className="axis-overview-cards">{ownedDatasets.slice(0, 3).map(dataset => <DatasetCard key={dataset.key} dataset={dataset} heading="h3" />)}</div> : <Empty><p>No datasets yet.</p><Link className="axis-button" href="/datasets/new"><Plus size={15} />Create dataset</Link></Empty>)}
      </>}
    </Panel>
    </div>
  </div>;
}
