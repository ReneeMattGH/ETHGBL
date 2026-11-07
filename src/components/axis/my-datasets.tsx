"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Database, Plus, Search, Wallet, X } from "lucide-react";
import type { Dataset } from "@/lib/axis/model";
import { Empty, Loading, Notice, PageIntro, RefreshButton, useApi } from "./shared";
import { useAxisWallet } from "./wallet";
import { DatasetCard } from "./library-cards";

export function MyDatasets() {
  const wallet = useAxisWallet();
  const owner = wallet.address?.toLowerCase();
  const resource = useApi<{ datasets: Dataset[] }>(owner ? `datasets?owner=${owner}` : null, 15000);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const term = search.trim().toLowerCase();
  const datasets = (resource.data?.datasets ?? [])
    .filter(dataset => dataset.owner.toLowerCase() === owner)
    .filter(dataset => status === "all" || dataset.enabled === (status === "enabled"))
    .filter(dataset => `${dataset.name} ${dataset.description} ${dataset.contract}`.toLowerCase().includes(term))
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const filtered = Boolean(term || status !== "all");

  return <div className="axis-owned-datasets">
    <PageIntro title="My datasets">
      {wallet.address && <RefreshButton loading={resource.loading} onClick={resource.refresh} />}
      <Link href="/datasets/new" className="axis-button"><Plus size={17} />Create dataset</Link>
    </PageIntro>

    <section className="axis-owned-panel" aria-label="Your datasets">
      {!wallet.address ? <Empty>
        <Wallet size={30} strokeWidth={1.5} aria-hidden="true" />
        <h2>Connect your wallet</h2>
        <button type="button" className="axis-button" disabled={wallet.busy} onClick={() => void wallet.connect().catch(() => {})}>{wallet.busy ? "Connecting..." : "Connect wallet"}<ArrowRight size={16} /></button>
      </Empty> : <>
        <div className="axis-owned-toolbar">
          <div className="axis-owned-search"><Search size={18} aria-hidden="true" /><input type="search" aria-label="Search your datasets" placeholder="Search datasets" value={search} onChange={event => setSearch(event.target.value)} />{search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")}><X size={16} /></button>}</div>
          <div className="axis-owned-filters"><span role="status">{resource.data ? `${datasets.length} ${datasets.length === 1 ? "dataset" : "datasets"}` : ""}</span><div className="axis-owned-select"><select aria-label="Dataset status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option><option value="enabled">Enabled</option><option value="paused">Paused</option></select><ChevronDown size={15} aria-hidden="true" /></div></div>
        </div>

        {resource.error && <div className="axis-owned-error"><Notice tone="error">{resource.error}</Notice></div>}
        {!resource.data && !resource.error ? <Loading /> : !resource.data ? <Empty><h2>Datasets are unavailable</h2><button type="button" className="axis-button secondary" disabled={resource.loading} onClick={resource.refresh}>Try again</button></Empty>
          : !datasets.length ? <Empty><Database size={30} strokeWidth={1.5} aria-hidden="true" /><h2>{filtered ? "No matching datasets" : "No datasets yet"}</h2>{filtered ? <button type="button" className="axis-button secondary" onClick={() => { setSearch(""); setStatus("all"); }}>Clear filters</button> : <Link href="/datasets/new" className="axis-button"><Plus size={16} />Create dataset</Link>}</Empty>
          : <div className="axis-owned-cards">{datasets.map(dataset => <DatasetCard key={dataset.key} dataset={dataset} />)}</div>}
      </>}
    </section>
  </div>;
}
