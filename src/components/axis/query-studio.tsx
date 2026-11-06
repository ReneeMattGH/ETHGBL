"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Dataset, Filters, SavedQuery } from "@/lib/axis/model";
import { api, useApi, PageIntro, Panel, DatasetSelect, FilterFields, Notice, Loading, TransferTable, CoverageNotice, QueryEvidence, MetricGrid, Field, type QueryResult } from "./shared";
import { publishQuery, removeEntity, renewEntity, useAxisWallet, walletError } from "./wallet";
export function QueryStudio() {
  const params = useSearchParams(), wallet = useAxisWallet();
  const catalog = useApi<{ datasets: Dataset[] }>("datasets"), saved = useApi<{ queries: SavedQuery[] }>(wallet.address ? `queries?owner=${wallet.address}` : null);
  const [datasetKey, setDataset] = React.useState(params.get("dataset") ?? ""), [filters, setFilters] = React.useState<Filters>({});
  const [executed, setExecuted] = React.useState<{ datasetKey: string; filters: Filters } | null>(null), [offset, setOffset] = React.useState(0), [limit, setLimit] = React.useState(25);
  const [title, setTitle] = React.useState("My USDC query"), [busy, setBusy] = React.useState(false), [message, setMessage] = React.useState<string | null>(null), [error, setError] = React.useState<string | null>(null);
  const result = useApi<QueryResult>(executed ? "query" : null, 0, { ...executed, offset, limit, mode: "page" });
  const analytics = useApi<QueryResult>(executed ? "query" : null, 0, { ...executed, mode: "analytics" });
  const dirty = Boolean(executed && (JSON.stringify(executed.filters) !== JSON.stringify(filters) || executed.datasetKey !== datasetKey));
  const run = () => { setOffset(0); setError(null); setExecuted({ datasetKey, filters: { ...filters } }); };
  const save = async () => {
    setBusy(true); setError(null); setMessage(null);
    try { const account = wallet.address ?? await wallet.connect(); await publishQuery(account, title, { datasetKey, filters }); saved.refresh(); setMessage("Query saved to your wallet-owned Arkiv entity."); }
    catch (caught) { setError(walletError(caught)); } finally { setBusy(false); }
  };
  const manageQuery = async (entityKey: string, action: "delete" | "renew") => {
    if (!wallet.address) return; setBusy(true); setError(null);
    try { if (action === "delete") await removeEntity(wallet.address, entityKey); else await renewEntity(wallet.address, entityKey); saved.refresh(); setMessage(action === "delete" ? "Saved query definition deleted." : "Saved query renewed for 30 days from now."); }
    catch (caught) { setError(walletError(caught)); } finally { setBusy(false); }
  };
  const exportCsv = async () => {
    if (!executed) return; setBusy(true); setError(null);
    try {
      const full = await api<QueryResult>("query", { ...executed, mode: "export" });
      const fields = ["sourceId", "blockNumber", "blockHash", "timestamp", "txHash", "logIndex", "sender", "recipient", "amountRaw", "amount"] as const;
      const lines = [fields.join(","), ...(full.entities ?? []).map(row => fields.map(field => `"${String(row[field]).replace(/"/g, '""')}"`).join(","))];
      const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" })), anchor = document.createElement("a"); anchor.href = url; anchor.download = "axis-usdc-transfers.csv"; anchor.click(); URL.revokeObjectURL(url); setMessage(`Exported ${full.entities?.length ?? 0} matching records from the complete verified scope.`);
    } catch (caught) { setError(walletError(caught)); } finally { setBusy(false); }
  };
  return <><PageIntro title="Query Studio" description="Compose indexed Arkiv filters and analyze the full verified scope. Amounts remain exact." /><Panel title="Query definition"><div className="axis-form-stack"><DatasetSelect datasets={catalog.data?.datasets ?? []} value={datasetKey} onChange={setDataset} /><FilterFields filters={filters} onChange={setFilters} /><div className="axis-form-grid"><Field label="Sort by source block"><select value={filters.order ?? "desc"} onChange={event => setFilters({ ...filters, order: event.target.value as "asc" | "desc" })}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></Field><Field label="Page size"><select value={limit} onChange={event => { setLimit(Number(event.target.value)); setOffset(0); }}>{[10, 25, 50, 100].map(value => <option key={value}>{value}</option>)}</select></Field></div><div className="axis-actions"><button className="axis-button" disabled={!datasetKey || result.loading} onClick={run}>{result.loading ? "Executing…" : "Execute query"}</button><button className="axis-button secondary" disabled={!executed || busy || dirty} onClick={() => void exportCsv()}>Export full result CSV</button><Link className="axis-inline-link" href={datasetKey ? `/dashboards/new?${new URLSearchParams({ dataset: datasetKey, filters: JSON.stringify(filters) }).toString()}` : "/dashboards/new"}>Build dashboard →</Link></div></div></Panel>{catalog.error && <Notice tone="error">{catalog.error}</Notice>}{dirty && <Notice>The editor has changed. Execute again to update the result.</Notice>}{[result.error, analytics.error, error].filter(Boolean).map((item, index) => <Notice tone="error" key={index}>{item}</Notice>)}{message && <Notice tone="success">{message}</Notice>}{result.loading && !result.data && <Loading />}{result.data && <><CoverageNotice coverage={result.data.coverage} /><p className="axis-widget-meta">Query calculation scope: Polygon blocks {result.data.scope.fromBlock}?{result.data.scope.toBlock}. Address, time and predicate filters apply within this range.</p>{analytics.data?.analytics && <MetricGrid analytics={analytics.data.analytics} />}<Panel title={`Query results · ${result.data.total ?? "—"} matching transfers`}><TransferTable rows={result.data.entities ?? []} /><div className="axis-pagination"><button className="axis-button secondary" disabled={offset === 0 || result.loading} onClick={() => setOffset(value => Math.max(0, value - limit))}>Previous</button><span>Page {Math.floor(offset / limit) + 1} · {result.data.entities?.length ?? 0} rows shown</span><button className="axis-button secondary" disabled={result.loading || offset + limit >= Number(result.data.total)} onClick={() => setOffset(value => value + limit)}>Next</button></div></Panel><QueryEvidence result={analytics.data ?? result.data} /></>}<Panel title="Wallet-owned saved queries"><div className="axis-form-grid"><Field label="Query title"><input value={title} maxLength={80} onChange={event => setTitle(event.target.value)} /></Field><div className="axis-actions"><button className="axis-button secondary" disabled={!datasetKey || busy || dirty || !result.data} onClick={() => void save()}>{busy ? "Working…" : "Save query to Arkiv"}</button></div></div>{saved.error && <Notice tone="error">{saved.error}</Notice>}{saved.data?.queries.map(query => <div className="axis-list-row" key={query.key}><button className="axis-link-button" onClick={() => { setDataset(query.query.datasetKey); setFilters(query.query.filters); setExecuted(query.query); setOffset(0); setTitle(query.title); }}>{query.title} ?</button><div className="axis-actions"><button className="axis-link-button" disabled={busy} onClick={() => void manageQuery(query.key, "renew")}>Renew</button><button className="axis-link-button" disabled={busy} onClick={() => void manageQuery(query.key, "delete")}>Delete</button></div></div>)}{!wallet.address && <p>Connect a wallet to save queries and load your query library.</p>}</Panel></>;
}
