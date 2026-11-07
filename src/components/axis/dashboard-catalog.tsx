"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDownWideNarrow, ArrowRight, BarChart3, ChevronDown, Database, LayoutDashboard, List, Plus, Search, SearchX, Wallet, X } from "lucide-react";
import type { SavedDocument } from "@/lib/axis/model";
import { Notice, RefreshButton, useApi } from "./shared";
import { useAxisWallet } from "./wallet";
import { DashboardCard } from "./library-cards";

function DashboardIllustration() {
  return <div className="axis-library-illustration" aria-hidden="true">
    <div className="axis-library-orbit orbit-one" /><div className="axis-library-orbit orbit-two" />
    <div className="axis-library-mini-card"><BarChart3 size={20} strokeWidth={1.6} /></div>
    <div className="axis-library-drawing">
      <div className="axis-library-drawing-top"><span /><span /><span /><i /></div>
      <div className="axis-library-drawing-body">
        <div className="axis-library-drawing-stat"><i /><b /><i /></div>
        <div className="axis-library-drawing-stat"><i /><b /><i /></div>
        <div className="axis-library-drawing-chart"><svg viewBox="0 0 200 55" fill="none"><path d="M0 14H200M0 36H200" stroke="#e9edf6" strokeDasharray="3 4" /><path d="M0 48 25 39 45 43 70 24 93 30 118 14 141 22 166 7 185 13 200 3V55H0Z" fill="#eef2ff" /><path d="m0 48 25-9 20 4 25-19 23 6 25-16 23 8 25-15 19 6 15-10" stroke="#1743ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
      </div>
    </div>
    <span className="axis-library-drawing-plus"><Plus size={22} strokeWidth={1.8} /></span>
  </div>;
}

export function DashboardCatalog() {
  const resource = useApi<{ dashboards: SavedDocument[] }>("dashboards", 30000);
  const wallet = useAxisWallet();
  const [mine, setMine] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState("updated");
  const [view, setView] = React.useState<"grid" | "list">("grid");
  const all = resource.data?.dashboards ?? [];
  const owned = all.filter(item => item.owner.toLowerCase() === wallet.address?.toLowerCase());
  const term = search.trim().toLowerCase();
  const dashboards = (mine ? owned : all)
    .filter(item => `${item.title} ${item.document.description} ${item.owner}`.toLowerCase().includes(term))
    .toSorted((a, b) => sort === "title" ? a.title.localeCompare(b.title) : Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const initialLoading = !resource.data && !resource.error;
  const filtered = Boolean(term || mine);
  const resetFilters = () => { setSearch(""); setMine(false); };

  return <div className="axis-library">
    <header className="axis-library-header">
      <div className="axis-library-heading"><span className="axis-library-heading-icon"><LayoutDashboard size={23} strokeWidth={1.7} /></span><h1>Dashboards</h1></div>
      <div className="axis-actions"><RefreshButton loading={resource.loading} onClick={resource.refresh} /><Link href="/dashboards/new" className="axis-button"><Plus size={17} />New dashboard</Link></div>
    </header>

    <section className="axis-library-panel" aria-label="Dashboard library">
      <div className="axis-library-tabs-row">
        <div className="axis-library-tabs" role="group" aria-label="Dashboard ownership">
          <button type="button" aria-pressed={!mine} onClick={() => setMine(false)}><LayoutDashboard size={16} />All dashboards<span>{resource.data ? all.length : "\u2014"}</span></button>
          <button type="button" aria-pressed={mine} onClick={() => setMine(true)}><Wallet size={16} />My dashboards{wallet.address && resource.data && <span>{owned.length}</span>}</button>
        </div>
      </div>

      <div className="axis-library-tools">
        <div className="axis-library-search"><Search size={18} aria-hidden="true" /><input type="search" aria-label="Search dashboards" placeholder="Search by title, description or owner..." value={search} onChange={event => setSearch(event.target.value)} />{search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")}><X size={16} /></button>}</div>
        <div className="axis-library-display"><div className="axis-library-sort"><ArrowDownWideNarrow size={16} aria-hidden="true" /><select aria-label="Sort dashboards" value={sort} onChange={event => setSort(event.target.value)}><option value="updated">Last updated</option><option value="title">Name A–Z</option></select><ChevronDown size={14} aria-hidden="true" /></div><div className="axis-library-views" role="group" aria-label="Dashboard display"><button type="button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}><LayoutDashboard size={17} /></button><button type="button" aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={18} /></button></div></div>
      </div>

      {resource.error && <div className="axis-library-error"><Notice tone="error">{resource.error}</Notice></div>}

      {initialLoading ? <div className="axis-library-loading" role="status"><span className="axis-library-loader" />Reading dashboards from Arkiv...</div>
        : !resource.data ? <div className="axis-library-empty axis-empty"><span className="axis-library-empty-icon"><Database size={27} strokeWidth={1.5} /></span><h2>Dashboards are unavailable</h2><p>We couldn’t load the library. Try refreshing in a moment.</p><button type="button" className="axis-button secondary" disabled={resource.loading} onClick={resource.refresh}>Try again<ArrowRight size={16} /></button></div>
        : dashboards.length ? <><div className="axis-library-results" role="status">{dashboards.length} {dashboards.length === 1 ? "dashboard" : "dashboards"}{filtered && " found"}</div><div className={`axis-library-cards ${view === "list" ? "is-list" : ""}`}>{dashboards.map(item => <DashboardCard key={item.key} dashboard={item} />)}</div></>
        : <div className="axis-library-empty axis-empty">
          {filtered ? <span className="axis-library-empty-icon">{mine && !wallet.address ? <Wallet size={27} strokeWidth={1.5} /> : <SearchX size={27} strokeWidth={1.5} />}</span> : <DashboardIllustration />}
          <h2>{mine && !wallet.address ? "Connect your wallet" : filtered ? "No matching dashboards." : "No dashboards yet."}</h2>
          <div className="axis-library-empty-actions">{mine && !wallet.address ? <button type="button" className="axis-button" disabled={wallet.busy} onClick={() => void wallet.connect().catch(() => {})}><Wallet size={16} />{wallet.busy ? "Connecting..." : "Connect wallet"}</button> : filtered ? <button type="button" className="axis-button secondary" onClick={resetFilters}>Clear filters<ArrowRight size={16} /></button> : <Link href="/dashboards/new" className="axis-button"><Plus size={17} />Create a dashboard</Link>}{!filtered && <Link href="/query" className="axis-library-text-link">Start with a query<ArrowRight size={16} /></Link>}</div>
        </div>}

    </section>
  </div>;
}
