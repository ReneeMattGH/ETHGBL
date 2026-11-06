"use client";
import * as React from "react";
import Link from "next/link";
import { ExternalLink, RefreshCw } from "lucide-react";
import type { Transfer, Dataset, Filters, CoverageSummary, Analytics } from "@/lib/axis/model";

export type QueryResult = { dataset: Dataset; coverage: CoverageSummary; scope: { fromBlock: string; toBlock: string; fromTime: string | null; toTime: string | null }; entities?: Transfer[]; total?: string; analytics?: Analytics; scannedRows?: number; executedQuery: string; blockNumber: string; fetchedAt: string };
const pendingReads = new Map<string, Promise<unknown>>();
export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const read = body === undefined || path === "query" && (body as { mode?: string }).mode !== "export";
  const cacheKey = `${path}:${JSON.stringify(body)}`;
  const existing = read ? pendingReads.get(cacheKey) : undefined;
  if (existing) return existing as Promise<T>;
  const request = (async () => {
    const response = await fetch(`/api/axis/${path}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: read ? undefined : signal, cache: "no-store" });
    const value = await response.json(); if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : "AXIS request failed."); return value as T;
  })();
  if (read) pendingReads.set(cacheKey, request);
  try { return await request; } finally { if (pendingReads.get(cacheKey) === request) pendingReads.delete(cacheKey); }
}
export function useApi<T>(path: string | null, interval = 0, body?: unknown) {
  const bodyKey = JSON.stringify(body);
  const [data, setData] = React.useState<T | null>(null), [error, setError] = React.useState<string | null>(null), [loading, setLoading] = React.useState(false), [revision, setRevision] = React.useState(0);
  const [updatedAt, setUpdatedAt] = React.useState<number | null>(null);
  React.useEffect(() => {
    setData(null); setError(null); setUpdatedAt(null);
    if (!path) { setLoading(false); return; }
    let cancelled = false, timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const run = async () => {
      setLoading(true);
      try { const value = await api<T>(path, bodyKey === undefined ? undefined : JSON.parse(bodyKey), controller.signal); if (!cancelled) { setData(value); setError(null); setUpdatedAt(Date.now()); } }
      catch (caught) { if (!cancelled) setError(caught instanceof Error ? caught.message : "Request failed."); }
      finally { if (!cancelled) { setLoading(false); if (interval) timer = setTimeout(run, interval); } }
    };
    void run();
    return () => { cancelled = true; controller.abort(); if (timer) clearTimeout(timer); };
  }, [path, bodyKey, interval, revision]);
  return { data, error, loading, updatedAt, refresh: () => setRevision(value => value + 1) };
}
export const short = (value: string, size = 6) => value ? `${value.slice(0, size + 2)}…${value.slice(-4)}` : "—";
export function PageIntro({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) { return <div className="axis-intro"><div><div className="axis-eyebrow">AXIS / ARKIV ANALYTICS</div><h1>{title}</h1><p>{description}</p></div><div className="axis-actions">{children}</div></div>; }
export function Panel({ title, children, actions }: { title?: string; children: React.ReactNode; actions?: React.ReactNode }) { return <section className="axis-panel">{title && <div className="axis-panel-heading"><h2>{title}</h2>{actions}</div>}{children}</section>; }
export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "error" | "success" }) { return <div role={tone === "error" ? "alert" : "status"} className={`axis-notice ${tone}`}>{children}</div>; }
export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  const generated = React.useId();
  const child = children as React.ReactElement<{ id?: string; "aria-describedby"?: string }>;
  const id = child.props?.id ?? generated;
  return <div className="axis-field"><label htmlFor={id}>{label}</label>{React.isValidElement(child) ? React.cloneElement(child, { id, ...(hint ? { "aria-describedby": `${id}-hint` } : {}) }) : children}{hint && <small id={`${id}-hint`}>{hint}</small>}</div>;
}
export function Stat({ label, value, detail }: { label: string; value: React.ReactNode; detail?: string }) { return <div className="axis-stat"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>; }
export function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) { return <button className="axis-button secondary" disabled={loading} onClick={onClick}><RefreshCw size={15} className={loading ? "animate-spin" : ""} />Refresh</button>; }
export function Empty({ children }: { children: React.ReactNode }) { return <div className="axis-empty">{children}</div>; }
export function Loading() { return <div role="status" className="axis-empty">Reading from Arkiv…</div>; }
export function DatasetSelect({ datasets, value, onChange }: { datasets: Dataset[]; value: string; onChange: (value: string) => void }) { return <Field label="Dataset"><select value={value} onChange={event => onChange(event.target.value)}><option value="">Select a dataset</option>{datasets.map(dataset => <option key={dataset.key} value={dataset.key}>{dataset.name} · {short(dataset.owner)}</option>)}</select></Field>; }
export function FilterFields({ filters, onChange, predicate = true }: { filters: Filters; onChange: (value: Filters) => void; predicate?: boolean }) {
  return <><Field label="Rolling window (verified blocks)" hint="Optional: 1–1000 blocks, advancing with the verified checkpoint. Leave fixed block boundaries empty."><input inputMode="numeric" value={filters.lookbackBlocks ?? ""} onChange={event => onChange({ ...filters, lookbackBlocks: event.target.value })} placeholder="Full verified range" /></Field><div className="axis-form-grid">{([ ["sender", "Sender address"], ["recipient", "Recipient address"], ["fromBlock", "From block"], ["toBlock", "To block"], ["fromTime", "From timestamp (Unix seconds)"], ["toTime", "To timestamp (Unix seconds)"] ] as const).map(([field, label]) => <Field key={field} label={label}><input value={filters[field] ?? ""} onChange={event => onChange({ ...filters, [field]: event.target.value })} placeholder={field === "sender" || field === "recipient" ? "0x…" : "All verified coverage"} /></Field>)}</div>{predicate && <Field label="Additional Arkiv predicate" hint="Native typed filters, not SQL. Example: amountRaw > u256(1000000)"><textarea rows={2} value={filters.predicate ?? ""} onChange={event => onChange({ ...filters, predicate: event.target.value })} placeholder="amountRaw > u256(1000000)" /></Field>}</>;
}
export function SourceLink({ hash }: { hash: string }) { return <a href={`https://polygonscan.com/tx/${hash}`} target="_blank" rel="noreferrer" className="axis-inline-link">{short(hash)}<ExternalLink size={12} /></a>; }
export function ArkivLink({ entityKey }: { entityKey: string }) { return <a href={`https://rabdi.explorer.arkiv.network/entity/${entityKey}`} target="_blank" rel="noreferrer" className="axis-inline-link">{short(entityKey)}<ExternalLink size={12} /></a>; }
export function TransferTable({ rows }: { rows: Transfer[] }) {
  const [selected, setSelected] = React.useState<Transfer | null>(null);
  return <><div className="axis-table-wrap"><table><thead><tr><th>Block</th><th>Transaction</th><th>Sender</th><th>Recipient</th><th>USDC</th><th>Details</th></tr></thead><tbody>{rows.map(row => <tr key={row.sourceId}><td>{row.blockNumber}</td><td><SourceLink hash={row.txHash} /></td><td title={row.sender}>{short(row.sender)}</td><td title={row.recipient}>{short(row.recipient)}</td><td className="axis-number">{row.amount}</td><td><button className="axis-link-button" onClick={() => setSelected(row)}>Inspect log {row.logIndex}</button></td></tr>)}</tbody></table>{rows.length === 0 && <Empty>No matching transfers in the verified range.</Empty>}</div>{selected && <div className="axis-modal-backdrop" onClick={() => setSelected(null)}><section role="dialog" aria-modal="true" aria-label="Transfer details" className="axis-modal" onClick={event => event.stopPropagation()}><div className="axis-panel-heading"><h2>Transfer details</h2><button className="axis-button secondary" onClick={() => setSelected(null)}>Close</button></div><pre>{JSON.stringify(selected, null, 2)}</pre><SourceLink hash={selected.txHash} /></section></div>}</>;
}
export function CoverageNotice({ coverage }: { coverage: CoverageSummary }) { return <Notice tone={coverage.gaps.length ? "error" : "info"}>Verified blocks: <b>{coverage.fromBlock}–{coverage.throughBlock ?? "not imported"}</b>. {coverage.actualRows.toLocaleString()} records readable in Arkiv. {!coverage.complete && "Requested coverage is not complete yet; metrics cover the verified prefix only. "}{coverage.gaps.join(" ")}</Notice>; }
export function QueryEvidence({ result }: { result: QueryResult }) { return <details className="axis-evidence"><summary>Query, provenance & calculation scope</summary><p>Polygon blocks {result.scope.fromBlock}–{result.scope.toBlock}. {result.scope.fromTime || result.scope.toTime ? `Unix time filter ${result.scope.fromTime ?? "unbounded"}–${result.scope.toTime ?? "unbounded"}. ` : ""}Arkiv read block {result.blockNumber}. {result.scannedRows !== undefined ? `${result.scannedRows} matching records scanned in full.` : "This table is one server-paginated result page."}</p><p>Publisher {result.dataset.writer}. Dataset owner {result.dataset.owner}. Fetched {new Date(result.fetchedAt).toLocaleString()}.</p><pre>{result.executedQuery}</pre></details>; }
export function MetricGrid({ analytics }: { analytics: Analytics }) { return <div className="axis-stats"><Stat label="Transfers" value={analytics.transfers.toLocaleString()} /><Stat label="Gross transferred USDC" value={analytics.amount} detail="Exact token amount; includes mint, burn and self-transfers" /><Stat label="Unique senders" value={analytics.uniqueSenders.toLocaleString()} /><Stat label="Unique recipients" value={analytics.uniqueRecipients.toLocaleString()} /></div>; }
export function DatasetCards({ datasets }: { datasets: Dataset[] }) { return <div className="axis-card-grid">{datasets.map(dataset => <Link className="axis-dataset-card" href={`/datasets/${dataset.key}`} key={dataset.key}><div className="axis-panel-heading"><b>{dataset.name}</b><span className="axis-badge">{dataset.enabled ? "Enabled" : "Paused"}</span></div><p>{dataset.description || "Polygon native USDC Transfer events"}</p><div>Blocks {dataset.startBlock}–{dataset.endBlock === "0" ? "continuous" : dataset.endBlock}</div><small>Owner {short(dataset.owner)} · Polygon 137</small></Link>)}</div>; }
