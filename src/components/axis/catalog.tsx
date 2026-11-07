"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, ArrowLeftRight, ArrowUpRight, Braces, Check, ChevronDown, ChevronRight, Coins, Copy, Database, ExternalLink, Landmark, Layers2, Network, PanelLeftOpen, Search, Table2, Tags, TrendingUp, Wallet, X } from "lucide-react";
import { CATALOG_DEFAULTS, CATALOG_GROUPS, PROTOCOLS, catalogTable, type CatalogEntry, type CatalogTable, type CatalogView } from "@/lib/axis/catalog";
import type { Dataset } from "@/lib/axis/model";
import { BULK_RECORD_SCHEMA, BULK_TABLES, type BulkTableId, type PublishedImport } from "@/lib/axis/bulk/publication-model";
import { newestTableImport } from "@/lib/axis/catalog-sources";
import { CollectionInsights } from "./catalog-insights";
import { useApi, PageIntro, RefreshButton, Notice, Loading, Empty, short } from "./shared";

type Preview = { tableId: string; scope: { kind?: "bulk"; datasetKey: string; name: string; fromBlock: string; throughBlock: string; rows: number } | null; rows: { key: string; values: Record<string, string | boolean> }[]; fields: { name: string; type: string; indexed: boolean }[]; total: string; offset: number; limit: number; executedQuery: string; blockNumber: string; fetchedAt: string; sourceScope?: string };
type Section = "overview" | "tables" | "schema" | "provenance";
const SECTIONS: Section[] = ["overview", "tables", "schema", "provenance"];
const ICONS = { tokens: Coins, network: Network, labels: Tags, code: Braces, wallet: Wallet, transfer: ArrowLeftRight, stablecoins: Coins, dex: TrendingUp, lending: Landmark, prediction: Activity, polygon: Network, quickswap: ArrowLeftRight, uniswap: Layers2, aave: Landmark, polymarket: Activity };
const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
function EntryIcon({ entry, small = false }: { entry: CatalogEntry; small?: boolean }) {
  const Icon = ICONS[entry.icon as keyof typeof ICONS] ?? Database;
  return <span className={`axis-catalog-icon ${entry.icon} ${small ? "small" : ""}`}><Icon size={small ? 16 : 25} strokeWidth={1.7} aria-hidden="true" /></span>;
}
function TableState({ table }: { table: CatalogTable }) { return <span className={`axis-catalog-state ${table.preview ? "available" : ""}`}>{table.preview && <span aria-hidden="true" />}{table.preview ? "Available" : "Not indexed"}</span>; }

export function DataCatalog() {
  const params = useSearchParams(), router = useRouter();
  const view: CatalogView = ["curated", "chains", "protocols"].includes(params.get("view") ?? "") ? params.get("view") as CatalogView : "curated";
  const entries = CATALOG_GROUPS[view];
  const entry = entries.find(item => item.id === params.get("item")) ?? entries.find(item => item.id === CATALOG_DEFAULTS[view])!;
  const imports = useApi<{ imports: PublishedImport[] }>("bulk/imports", 30000);
  const source = useApi<{ dataset: Dataset }>("catalog/source", 30000);
  const publishedImports = (imports.data?.imports ?? []).filter(item => item.document.throughBlock && item.document.recordCount > 0);
  const originalTables = entry.tables.map(id => catalogTable(id)!);
  const tableImports = new Map(originalTables.map(item => [item.id, Object.hasOwn(BULK_TABLES, item.id) && (params.get("import") || !["transfers", "blocks"].includes(item.preview ?? "")) ? newestTableImport(publishedImports, item.id as BulkTableId, params.get("import")) : undefined]));
  const tables: CatalogTable[] = originalTables.map(item => tableImports.get(item.id) ? { ...item, preview: "bulk", schema: BULK_RECORD_SCHEMA, datasetScoped: false, columns: [...BULK_TABLES[item.id as BulkTableId]] } : params.get("import") ? { ...item, preview: undefined } : item);
  const table = tables.find(item => item.id === params.get("table")) ?? tables.find(item => item.preview) ?? tables[0];
  const imported = tableImports.get(table.id);
  const coverageImport = params.get("import") ? publishedImports.find(item => item.key === params.get("import")) : publishedImports.find(item => item.document.tableCoverage?.[table.id as BulkTableId]?.state === "unavailable");
  const unavailableDetail = coverageImport?.document.tableCoverage?.[table.id as BulkTableId]?.detail;
  const section: Section = SECTIONS.includes(params.get("section") as Section) ? params.get("section") as Section : "overview";
  const dataset = source.data?.dataset;
  const [revision, setRevision] = React.useState(0);
  const [search, setSearch] = React.useState(""), [browseOpen, setBrowseOpen] = React.useState(false), [offset, setOffset] = React.useState(0), [copied, setCopied] = React.useState(false), [copyError, setCopyError] = React.useState<string | null>(null);
  const [collapsedEntry, setCollapsedEntry] = React.useState<string | null>(null);
  const paramsText = params.toString(), pendingParams = React.useRef(paramsText);
  React.useEffect(() => { pendingParams.current = paramsText; }, [paramsText]);
  const searchRef = React.useRef<HTMLInputElement>(null), titleRef = React.useRef<HTMLHeadingElement>(null), browseRef = React.useRef<HTMLButtonElement>(null);
  const select = (patch: Record<string, string>, focus = false) => {
    const next = new URLSearchParams(pendingParams.current);
    next.delete("dataset"); next.delete("source");
    for (const [key, value] of Object.entries(patch)) { if (value) next.set(key, value); else next.delete(key); }
    pendingParams.current = next.toString();
    setOffset(0); setCopied(false); setCopyError(null);
    router.push(`/explore?${next.toString()}`, { scroll: false });
    if (focus) { setBrowseOpen(false); requestAnimationFrame(() => titleRef.current?.focus()); }
  };
  const selectEntry = (item: CatalogEntry) => {
    if (view !== "curated" && item.id === entry.id) { setCollapsedEntry(value => value === item.id ? null : item.id); return; }
    setCollapsedEntry(null); select({ item: item.id, table: "", section: "overview", import: "" }, true);
  };
  const switchView = (next: CatalogView) => { setSearch(""); setCollapsedEntry(null); select({ view: next, item: CATALOG_DEFAULTS[next], table: "", section: "overview", import: "" }); };
  const term = search.trim().toLowerCase();
  const filtered = entries.filter(item => `${item.name} ${item.description} ${item.tables.map(id => catalogTable(id)?.name).join(" ")}`.toLowerCase().includes(term));
  const hasAvailable = tables.some(item => item.preview);
  const previewParams = new URLSearchParams({ table: table.id, offset: String(offset), ...(imported ? { import: imported.key } : dataset ? { dataset: dataset.key } : {}) });
  const preview = useApi<Preview>(table.preview && (!table.datasetScoped || dataset) && section !== "overview" ? `catalog/preview?${previewParams}` : null, 30000);
  const result = preview.data?.tableId === table.id && preview.data.offset === offset && (imported ? preview.data.scope?.kind === "bulk" && preview.data.scope.datasetKey === imported.key : preview.data.scope?.kind !== "bulk") && (!table.datasetScoped || preview.data.scope?.datasetKey === dataset?.key) ? preview.data : null;
  React.useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setBrowseOpen(true); requestAnimationFrame(() => searchRef.current?.focus()); }
      if (event.key === "Escape" && browseOpen) { setBrowseOpen(false); browseRef.current?.focus(); }
    };
    window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown);
  }, [browseOpen]);
  const selectTable = (item: CatalogTable) => select({ table: item.id, section: "tables" }, true);
  const setSection = (next: Section) => select({ section: next });
  const copyQuery = async () => { try { await navigator.clipboard.writeText(result!.executedQuery); setCopied(true); } catch { setCopyError("Clipboard unavailable. Select and copy the query below."); } };

  return <>
    <PageIntro title="Data Explorer"><RefreshButton loading={source.loading || preview.loading || imports.loading} onClick={() => { source.refresh(); imports.refresh(); preview.refresh(); setRevision(value => value + 1); }} /></PageIntro>
    {imports.error && <Notice tone="error">{imports.error}</Notice>}
    {params.get("import") && imports.data && !publishedImports.some(item => item.key === params.get("import")) && <Notice tone="error">The selected import has no verified published coverage or is no longer available.</Notice>}
    <div className="axis-catalog-workspace">
      <button ref={browseRef} className="axis-catalog-mobile-toggle" aria-expanded={browseOpen} aria-controls="catalog-navigation" onClick={() => setBrowseOpen(value => !value)}><PanelLeftOpen size={17} />Browse catalog<span>{entry.name}</span><ChevronDown size={16} /></button>
      <aside id="catalog-navigation" className={`axis-catalog-browser ${browseOpen ? "open" : ""}`} aria-label="Data catalog">
        <div className="axis-catalog-search" role="search"><Search size={18} aria-hidden="true" /><input ref={searchRef} aria-label="Search catalog" placeholder={view === "curated" ? "Search datasets" : view === "chains" ? "Search blockchains" : "Search protocols"} value={search} onChange={event => setSearch(event.target.value)} />{search ? <button className="axis-icon-button" aria-label="Clear catalog search" onClick={() => { setSearch(""); searchRef.current?.focus(); }}><X size={15} /></button> : <kbd title="Control or Command K">⌘ K</kbd>}</div>
        <div className="axis-catalog-switcher" role="tablist" aria-label="Catalog categories">{(["curated", "chains", "protocols"] as const).map((item, index, views) => <button key={item} role="tab" id={`catalog-tab-${item}`} aria-controls="catalog-tree" aria-selected={view === item} tabIndex={view === item ? 0 : -1} onClick={() => switchView(item)} onKeyDown={event => {
          const next = event.key === "ArrowRight" ? views[(index + 1) % 3] : event.key === "ArrowLeft" ? views[(index + 2) % 3] : event.key === "Home" ? views[0] : event.key === "End" ? views[2] : null;
          if (next) { event.preventDefault(); switchView(next); document.getElementById(`catalog-tab-${next}`)?.focus(); }
        }}>{label(item)}</button>)}</div>
        <div className="axis-catalog-tree" id="catalog-tree" role="tabpanel" aria-labelledby={`catalog-tab-${view}`}>
          {filtered.map(item => <div key={item.id} className="axis-catalog-group">
            <button className={`axis-catalog-entry ${item.id === entry.id ? "selected" : ""}`} aria-current={item.id === entry.id ? "true" : undefined} aria-expanded={view !== "curated" ? item.id === entry.id && collapsedEntry !== item.id : undefined} onClick={() => selectEntry(item)}>
              {view !== "curated" && (item.id === entry.id && collapsedEntry !== item.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
              {view !== "curated" && <EntryIcon entry={item} small />}<span>{item.name}</span>
              {view === "curated" && item.tables.some(id => catalogTable(id)?.preview || Object.hasOwn(BULK_TABLES, id) && newestTableImport(publishedImports, id as BulkTableId)) && <span className="axis-catalog-available-dot" title="Includes queryable records" aria-hidden="true" />}
            </button>
            {view !== "curated" && item.id === entry.id && collapsedEntry !== item.id && <div className="axis-catalog-table-tree">{tables.filter(child => !term || `${item.name} ${child.name}`.toLowerCase().includes(term)).map(child => <button key={child.id} className={table.id === child.id && section !== "overview" ? "selected" : ""} onClick={() => selectTable(child)} aria-current={table.id === child.id && section !== "overview" ? "true" : undefined}><Table2 size={15} /><span>{child.name.split(".").slice(1).join(".")}</span>{!child.preview && <span className="axis-catalog-pending-dot" title="Not indexed" aria-hidden="true" />}</button>)}</div>}
          </div>)}
          {!filtered.length && <div className="axis-catalog-no-results">No matching {view === "curated" ? "collections" : view}.<button className="axis-link-button" onClick={() => setSearch("")}>Clear search</button></div>}
        </div>
      </aside>

      <section className="axis-catalog-detail" aria-label={`${entry.name} catalog details`}>
        <div className="axis-catalog-breadcrumb"><span>{view === "curated" ? "Curated datasets" : label(view)}</span><ChevronRight size={13} /><span>{entry.name}</span>{section !== "overview" && <><ChevronRight size={13} /><span className="axis-catalog-breadcrumb-table">{table.name.split(".").slice(1).join(".")}</span></>}</div>
        <header className="axis-catalog-hero"><EntryIcon entry={entry} /><div><h2 ref={titleRef} tabIndex={-1}>{entry.name}</h2><p>{entry.description}</p></div></header>
        <div className="axis-catalog-meta"><span className="axis-catalog-chain"><Network size={14} />Polygon</span><span className={`axis-catalog-state ${hasAvailable ? "available" : ""}`}>{hasAvailable ? "Limited coverage" : "Not indexed"}</span>{entry.docs && <a className="axis-inline-link" href={entry.docs} target="_blank" rel="noreferrer">Documentation<ExternalLink size={13} /></a>}</div>
        <div className="axis-catalog-detail-tabs" role="tablist" aria-label="Catalog detail views">{SECTIONS.map((item, index) => <button key={item} role="tab" id={`catalog-section-${item}`} aria-selected={section === item} aria-controls="catalog-detail-panel" tabIndex={section === item ? 0 : -1} onClick={() => setSection(item)} onKeyDown={event => {
          const next = event.key === "ArrowRight" ? SECTIONS[(index + 1) % SECTIONS.length] : event.key === "ArrowLeft" ? SECTIONS[(index + SECTIONS.length - 1) % SECTIONS.length] : event.key === "Home" ? SECTIONS[0] : event.key === "End" ? SECTIONS[SECTIONS.length - 1] : null;
          if (next) { event.preventDefault(); setSection(next); document.getElementById(`catalog-section-${next}`)?.focus(); }
        }}>{label(item)}</button>)}</div>
        <div id="catalog-detail-panel" className="axis-catalog-detail-panel" role="tabpanel" aria-labelledby={`catalog-section-${section}`}>
          {table.datasetScoped && source.error && <Notice tone="error">{source.error}</Notice>}
          {section === "overview" ? <>
            <CollectionInsights key={`${view}:${entry.id}:${params.get("import") ?? "live"}`} view={view} entryId={entry.id} importKey={params.get("import")} revision={revision} />
            <CatalogTableList tables={tables} onSelect={selectTable} />
            {!!entry.related?.length && <div className="axis-catalog-related"><h3>Explore by protocol</h3><div>{entry.related.map(id => { const protocol = PROTOCOLS.find(item => item.id === id)!; return <button key={id} onClick={() => select({ view: "protocols", item: id, table: "", section: "overview" }, true)}><EntryIcon entry={protocol} small /><span>{protocol.name}</span><ArrowUpRight size={15} /></button>; })}</div></div>}
          </> : <>
            <div className="axis-catalog-table-picker"><label htmlFor="catalog-table">Table</label><select id="catalog-table" value={table.id} onChange={event => select({ table: event.target.value })}>{tables.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select><TableState table={table} /></div>
            {!table.preview ? <><CatalogNotIndexed table={table} />{unavailableDetail && <Notice>{unavailableDetail}</Notice>}</> : table.datasetScoped && !dataset ? !source.data && !source.error ? <Loading /> : <Empty>Polygon activity is unavailable.</Empty> : <>
              {preview.error && <Notice tone="error">{preview.error}</Notice>}
              {!result && !preview.error && <Loading />}
              {result && <>
                <div className="axis-catalog-result-heading"><div><h3>{table.name}</h3><span>{Number(result.total).toLocaleString()} verified records</span></div><button className="axis-button secondary" onClick={() => setSection("provenance")}>View Arkiv query<Braces size={14} /></button></div>
                {section === "tables" && <><CatalogRows table={table} preview={result} /><div className="axis-pagination"><button className="axis-button secondary" disabled={!offset || preview.loading} onClick={() => setOffset(value => Math.max(0, value - 10))}>Previous</button><span>{Number(result.total) ? `${offset + 1}–${offset + result.rows.length} of ${Number(result.total).toLocaleString()}` : "0 records"}</span><button className="axis-button secondary" disabled={preview.loading || offset + 10 >= Number(result.total)} onClick={() => setOffset(value => value + 10)}>Next</button></div></>}
                {section === "schema" && <div className="axis-table-wrap axis-catalog-data-table"><table aria-label={`${table.name} schema`}><thead><tr><th>Column</th><th>Arkiv type</th><th>Indexed</th></tr></thead><tbody>{result.fields.map(field => <tr key={field.name}><td className="axis-mono">{field.name}</td><td><span className="axis-catalog-type">{field.type}</span></td><td>{field.indexed ? <span className="axis-catalog-indexed"><Check size={13} />Yes</span> : "No"}</td></tr>)}</tbody></table>{!result.fields.length && <Empty>No stored record is available to inspect its schema.</Empty>}</div>}
                {section === "provenance" && <div className="axis-catalog-provenance"><dl className="axis-details"><dt>Storage network</dt><dd>Arkiv Rabdi</dd><dt>Source chain</dt><dd>Polygon PoS · 137</dd><dt>Entity schema</dt><dd className="axis-mono">{table.schema}</dd><dt>Arkiv read block</dt><dd>{result.blockNumber}</dd><dt>Read at</dt><dd>{new Date(result.fetchedAt).toLocaleString()}</dd>{result.scope && <><dt>Source</dt><dd>{result.scope.kind === "bulk" ? <span>{result.scope.name}</span> : <Link className="axis-inline-link" href={`/datasets/${result.scope.datasetKey}`}>{result.scope.name}<ArrowUpRight size={13} /></Link>}</dd></>}</dl><div className="axis-catalog-query-heading"><h3>Executed Arkiv query</h3><button className="axis-link-button" onClick={() => void copyQuery()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy query"}</button></div><pre>{result.executedQuery}</pre>{copyError && <Notice tone="error">{copyError}</Notice>}{result.scope?.kind === "bulk" && <p>Verified blocks {result.scope.fromBlock}–{result.scope.throughBlock}. {result.sourceScope}</p>}<p>Read directly from Arkiv. Coverage reflects imported records, not the current Polygon head.</p></div>}
              </>}
            </>}
          </>}
        </div>
      </section>
    </div>
  </>;
}

function CatalogTableList({ tables, onSelect }: { tables: CatalogTable[]; onSelect: (table: CatalogTable) => void }) {
  return <div className="axis-catalog-table-list"><div className="axis-catalog-section-heading"><h3>Tables in this collection</h3><span>{tables.length} {tables.length === 1 ? "table" : "tables"}</span></div>{tables.map(table => <button key={table.id} onClick={() => onSelect(table)}><span className="axis-catalog-table-icon"><Table2 size={19} strokeWidth={1.5} /></span><span><b>{table.name}</b><span>{table.description}</span></span><TableState table={table} /><ChevronRight size={16} /></button>)}</div>;
}
function CatalogNotIndexed({ table }: { table: CatalogTable }) {
  return <div className="axis-catalog-not-indexed"><span><Database size={27} strokeWidth={1.4} /></span><h3>This table is not indexed yet</h3><p>{table.description}</p><div>No verified preview is available for this source.</div><Link href="/explore?view=curated&item=token-transfers" className="axis-button secondary">Explore available data<ArrowUpRight size={15} /></Link></div>;
}

function CatalogRows({ table, preview }: { table: CatalogTable; preview: Preview }) {
  return <div className="axis-table-wrap axis-catalog-data-table"><table aria-label={`${table.name} preview`}><thead><tr>{table.columns?.map(column => <th key={column}>{column}</th>)}<th>Arkiv entity</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.key}>{table.columns?.map(column => <td className={column === "symbol" ? undefined : "axis-mono"} key={column} title={String(row.values[column] ?? "")}>
    {column === "txHash" ? <a className="axis-inline-link" href={`https://polygonscan.com/tx/${row.values[column]}`} target="_blank" rel="noreferrer">{short(String(row.values[column]))}<ExternalLink size={11} /></a> : ["sender", "recipient", "contract", "blockHash"].includes(column) ? short(String(row.values[column] ?? "")) : String(row.values[column] ?? "—")}
  </td>)}<td><a className="axis-inline-link axis-mono" href={`https://rabdi.explorer.arkiv.network/entity/${row.key}`} target="_blank" rel="noreferrer">{short(row.key)}<ExternalLink size={11} /></a></td></tr>)}</tbody></table>{!preview.rows.length && <Empty>No records in this verified scope.</Empty>}</div>;
}
