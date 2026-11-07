"use client";
// @refresh reset
import * as React from "react";
import Link from "next/link";
import { Database, ExternalLink, RefreshCw, X } from "lucide-react";
import type { Transfer, Dataset, Filters, CoverageSummary, Analytics, QueryResult } from "@/lib/axis/model";
import { POLYGON_ACTIVITY_DATASET_KEY } from "@/lib/axis/catalog-sources";
import { api } from "@/lib/axis/client-api";
import { browserReadCache, readCacheKey, READ_FRESH_MS } from "@/lib/axis/read-cache";
export type { QueryResult };
export { api };
const ApiBase = React.createContext("/api/axis/");
export function AxisApiProvider({ basePath, children }: { basePath: string; children: React.ReactNode }) {
  return <ApiBase.Provider value={basePath}>{children}</ApiBase.Provider>;
}
export function useApi<T>(path: string | null, interval = 0, body?: unknown) {
  const basePath = React.useContext(ApiBase), bodyKey = JSON.stringify(body);
  const cacheKey = readCacheKey(path, body, basePath);
  const subscribe = React.useCallback((listener: () => void) => browserReadCache.subscribe(listener), []);
  const snapshot = React.useCallback(() => browserReadCache.peek<T>(cacheKey), [cacheKey]);
  const cached = React.useSyncExternalStore(subscribe, snapshot, () => null);
  const [revision, setRevision] = React.useState(0);
  const input = JSON.stringify([basePath, path, bodyKey]), requestKey = revision + ":" + input;
  type State = { key: string; data: T | null; error: string | null; loading: boolean; updatedAt: number | null };
  const [state, setState] = React.useState<State>({ key: "", data: null, error: null, loading: false, updatedAt: null });
  const previous = React.useRef<{ input: string; cacheKey: string | null; revision: number } | null>(null);
  React.useEffect(() => browserReadCache.onInvalidate(() => setRevision(value => value + 1)), []);
  React.useEffect(() => {
    browserReadCache.restore();
    const initial = browserReadCache.peek<T>(cacheKey);
    const force = previous.current !== null && (previous.current.revision !== revision || previous.current.cacheKey === cacheKey && previous.current.input !== input);
    previous.current = { input, cacheKey, revision };
    setState({ key: requestKey, data: initial?.value ?? null, error: null, loading: false, updatedAt: initial?.updatedAt ?? null });
    if (!path) return;
    let cancelled = false, running = false, timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      if (cancelled || running) return;
      running = true;
      const generation = browserReadCache.generation;
      if (timer) clearTimeout(timer);
      setState(value => ({ ...value, loading: true, error: null }));
      try {
        const value = await api<T>(path, bodyKey === undefined ? undefined : JSON.parse(bodyKey), undefined, basePath);
        if (!cancelled && generation === browserReadCache.generation) setState({ key: requestKey, data: value, error: null, loading: false, updatedAt: Date.now() });
      } catch (caught) {
        if (!cancelled && generation === browserReadCache.generation) setState(value => ({ ...value, loading: false, error: caught instanceof Error ? caught.message : "Request failed." }));
      } finally {
        running = false;
        if (!cancelled && interval) timer = setTimeout(run, interval);
      }
    };
    if (force || !initial || Date.now() - initial.updatedAt >= Math.min(READ_FRESH_MS, interval || READ_FRESH_MS)) void run();
    else if (interval) timer = setTimeout(run, Math.max(0, interval - (Date.now() - initial.updatedAt)));
    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      const entry = browserReadCache.peek(cacheKey);
      if (!entry || Date.now() - entry.updatedAt >= Math.min(READ_FRESH_MS, interval || READ_FRESH_MS)) void run();
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [path, bodyKey, interval, revision, basePath, cacheKey, input, requestKey]);
  const current = state.key === requestKey ? state : null;
  const data = cached?.value ?? current?.data ?? null;
  const error = current?.error ? (data ? "Refresh failed. Showing the last successful data. " : "") + current.error : null;
  return { data, error, failure: current?.error ?? null, loading: Boolean(path && (current?.loading || !data && !error)), updatedAt: cached?.updatedAt ?? current?.updatedAt ?? null, refresh: () => setRevision(value => value + 1) };
}
export const short = (value: string, size = 6) => value ? `${value.slice(0, size + 2)}…${value.slice(-4)}` : "—";
export function PageIntro({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) { return <div className="axis-intro"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{children && <div className="axis-actions">{children}</div>}</div>; }
export function Panel({ title, children, actions, className = "" }: { title?: string; children: React.ReactNode; actions?: React.ReactNode; className?: string }) { return <section className={`axis-panel ${className}`}>{(title || actions) && <div className="axis-panel-heading">{title && <h2>{title}</h2>}{actions}</div>}{children}</section>; }
export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "error" | "success" }) { return <div role={tone === "error" ? "alert" : "status"} className={`axis-notice ${tone}`}>{children}</div>; }
export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  const generated = React.useId();
  const child = children as React.ReactElement<{ id?: string; "aria-describedby"?: string }>;
  const id = child.props?.id ?? generated;
  return <div className="axis-field"><label htmlFor={id}>{label}</label>{React.isValidElement(child) ? React.cloneElement(child, { id, ...(hint ? { "aria-describedby": `${id}-hint` } : {}) }) : children}{hint && <span className="axis-supporting" id={`${id}-hint`}>{hint}</span>}</div>;
}
export function Stat({ label, value, detail }: { label: string; value: React.ReactNode; detail?: string }) { return <div className="axis-stat"><span>{label}</span><strong>{value}</strong>{detail && <span className="axis-supporting">{detail}</span>}</div>; }
export function RefreshButton({ loading, onClick, compact = false, label = "Refresh" }: { loading: boolean; onClick: () => void; compact?: boolean; label?: string }) { return <button type="button" className={compact ? "axis-icon-button" : "axis-button secondary"} aria-label={label} title={label} disabled={loading} onClick={onClick}><RefreshCw size={14} className={loading ? "animate-spin" : ""} />{!compact && "Refresh"}</button>; }
export function Empty({ children }: { children: React.ReactNode }) { return <div className="axis-empty">{children}</div>; }
export function Loading({ label = "Reading from Arkiv…" }: { label?: string }) { return <div role="status" aria-live="polite" className="axis-empty axis-loading"><RefreshCw size={20} className="axis-loading-icon" aria-hidden="true" /><span>{label}</span></div>; }
// Legacy prebuilt-dashboard source, excluded by identity rather than its editable title.
const legacyActivityDatasetKey = POLYGON_ACTIVITY_DATASET_KEY;
export function DatasetSelect({ datasets, value, onChange, disabled = false }: { datasets: Dataset[]; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const legacySelected = value.toLowerCase() === legacyActivityDatasetKey;
  React.useEffect(() => { if (legacySelected) onChange(""); }, [legacySelected, onChange]);
  return <Field label="Dataset"><select disabled={disabled} value={legacySelected ? "" : value} onChange={event => onChange(event.target.value)}><option value="">Select a dataset</option>{datasets.filter(dataset => dataset.key.toLowerCase() !== legacyActivityDatasetKey).map(dataset => <option key={dataset.key} value={dataset.key}>{dataset.name} · {short(dataset.owner)}</option>)}</select></Field>;
}
export function FilterFields({ filters, onChange, predicate = true }: { filters: Filters; onChange: (value: Filters) => void; predicate?: boolean }) {
  return <><div className="axis-form-grid">{([ ["sender", "Sender address"], ["recipient", "Recipient address"], ["fromTime", "From timestamp (Unix seconds)"], ["toTime", "To timestamp (Unix seconds)"] ] as const).map(([field, label]) => <Field key={field} label={label}><input value={filters[field] ?? ""} onChange={event => onChange({ ...filters, [field]: event.target.value })} placeholder={field === "sender" || field === "recipient" ? "0x…" : "All verified coverage"} /></Field>)}</div>{predicate && <Field label="Additional Arkiv predicate" hint="Native predicate; e.g. amountRaw > u256(1000000)"><textarea rows={2} value={filters.predicate ?? ""} onChange={event => onChange({ ...filters, predicate: event.target.value })} placeholder="amountRaw > u256(1000000)" /></Field>}</>;
}
export function SourceLink({ hash }: { hash: string }) { return <a href={`https://polygonscan.com/tx/${hash}`} target="_blank" rel="noreferrer" className="axis-inline-link">{short(hash)}<ExternalLink size={12} /></a>; }
export function ArkivLink({ entityKey }: { entityKey: string }) { return <a href={`https://rabdi.explorer.arkiv.network/entity/${entityKey}`} target="_blank" rel="noreferrer" className="axis-inline-link">{short(entityKey)}<ExternalLink size={12} /></a>; }
function TransferDialog({ row, onClose }: { row: Transfer; onClose: () => void }) {
  const dialog = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => { const element = dialog.current!; element.showModal(); return () => { if (element.open) element.close(); }; }, []);
  return <dialog ref={dialog} className="axis-modal" aria-labelledby="transfer-dialog-title" onClose={onClose} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
    <div className="axis-modal-header"><h2 id="transfer-dialog-title">Transfer details</h2><button className="axis-icon-button" aria-label="Close transfer details" onClick={() => dialog.current?.close()}><X size={18} /></button></div>
    <dl className="axis-details"><dt>Source block</dt><dd className="axis-mono">{row.blockNumber}</dd><dt>Sender</dt><dd className="axis-mono">{row.sender}</dd><dt>Recipient</dt><dd className="axis-mono">{row.recipient}</dd><dt>Amount</dt><dd>{row.amount} USDC</dd><dt>Log index</dt><dd>{row.logIndex}</dd><dt>Transaction</dt><dd><SourceLink hash={row.txHash} /></dd></dl>
    <details className="axis-evidence"><summary>Raw record</summary><pre>{JSON.stringify(row, null, 2)}</pre></details>
  </dialog>;
}
export function TransferTable({ rows, sources }: { rows: Transfer[]; sources?: { key: string; name: string }[] }) {
  const [selected, setSelected] = React.useState<Transfer | null>(null);
  const basePath = React.useContext(ApiBase);
  const sourceHref = (key: string) => basePath === "/api/axis/" ? `/datasets/${key}` : `https://rabdi.explorer.arkiv.network/entity/${key}`;
  return <><div className="axis-table-wrap"><table aria-label="Verified transfers"><thead><tr>{sources && <th>Source dataset</th>}<th>Block</th><th>Transaction</th><th>Sender</th><th>Recipient</th><th className="axis-number">Amount · USDC</th><th>Log</th></tr></thead><tbody>{rows.map(row => <tr key={row.entityKey ?? `${row.datasetKey ?? ""}:${row.sourceId}`} >{sources && <td>{row.datasetKey ? <Link className="axis-inline-link" href={sourceHref(row.datasetKey)}>{sources.find(source => source.key === row.datasetKey)?.name ?? short(row.datasetKey)}</Link> : "Unavailable"}</td>}<td className="axis-mono">{row.blockNumber}</td><td><SourceLink hash={row.txHash} /></td><td title={row.sender} className="axis-mono">{short(row.sender)}</td><td title={row.recipient} className="axis-mono">{short(row.recipient)}</td><td className="axis-number axis-mono">{row.amount}</td><td><button className="axis-link-button" onClick={() => setSelected(row)} aria-label={`Inspect log ${row.logIndex}`}>{row.logIndex}<ExternalLink size={11} /></button></td></tr>)}</tbody></table>{rows.length === 0 && <Empty>No matching transfers.</Empty>}</div>{selected && <TransferDialog row={selected} onClose={() => setSelected(null)} />}</>;
}
export function CoverageNotice({ coverage }: { coverage: CoverageSummary }) { return <Notice tone={coverage.gaps.length ? "error" : "info"}><b>{coverage.actualRows.toLocaleString()} records</b> · {coverage.gaps.length ? "Verification requires attention" : coverage.throughBlock ? "Imported data verified" : "Awaiting import"}{!coverage.complete && " · Partial coverage"}{coverage.gaps.length > 0 && ` · ${coverage.gaps.join(" ")}`}</Notice>; }
export function QueryEvidence({ result, calculation }: { result: QueryResult; calculation?: React.ReactNode }) {
  if (result.sources) return <details className="axis-evidence"><summary>Query & provenance</summary>
    <dl className="axis-details"><dt>Storage network</dt><dd>Arkiv Rabdi</dd><dt>Selected datasets</dt><dd>{result.sources.length}</dd><dt>Records scanned</dt><dd>{result.scannedRows ?? "Paginated result"}</dd><dt>Arkiv read block</dt><dd>{result.blockNumber}</dd><dt>Fetched</dt><dd>{new Date(result.fetchedAt).toLocaleString()}</dd></dl>
    {result.sources.map(source => <div key={source.datasetKey}><h3>{source.dataset.name}</h3><p>Verified blocks {source.coverage.fromBlock}–{source.coverage.throughBlock}. {source.coverage.complete ? "Complete source coverage." : "Partial source coverage."}</p><pre>{JSON.stringify(source.filters, null, 2)}</pre></div>)}
    <pre>{result.executedQuery}</pre>{calculation && <p>{calculation}</p>}<p>Arkiv combines matching entities with OR. Overlapping scopes return an entity once; separate records stored under different datasets remain separate.</p>
  </details>;
  return <details className="axis-evidence"><summary>Query & provenance</summary>
    <dl className="axis-details"><dt>Data source</dt><dd>Verified Polygon USDC transfers</dd><dt>Records scanned</dt><dd>{result.scannedRows ?? "Paginated result"}</dd><dt>Arkiv read block</dt><dd>{result.blockNumber}</dd><dt>Publisher</dt><dd className="axis-mono">{result.dataset.writer}</dd><dt>Dataset owner</dt><dd className="axis-mono">{result.dataset.owner}</dd><dt>Fetched</dt><dd>{new Date(result.fetchedAt).toLocaleString()}</dd>{(result.scope.fromTime || result.scope.toTime) && <><dt>Time filter</dt><dd>{result.scope.fromTime ?? "unbounded"}–{result.scope.toTime ?? "unbounded"}</dd></>}</dl>
    <pre>{result.executedQuery}</pre>{calculation && <p>{calculation}</p>}<p>Amounts use exact integer base units. Gross volume includes mint, burn and self-transfers. Charts use approximate coordinates with exact tooltip values.</p>
  </details>;
}
export function MetricGrid({ analytics }: { analytics: Analytics }) { return <div className="axis-stats"><Stat label="Transfers" value={analytics.transfers.toLocaleString()} /><Stat label="Transferred USDC" value={analytics.amount} /><Stat label="Unique senders" value={analytics.uniqueSenders.toLocaleString()} /><Stat label="Unique recipients" value={analytics.uniqueRecipients.toLocaleString()} /></div>; }
export function DatasetCards({ datasets }: { datasets: Dataset[] }) { return <div className="axis-card-grid">{datasets.map(dataset => <Link className="axis-dataset-card" href={`/datasets/${dataset.key}`} key={dataset.key}><div className="axis-panel-heading"><div className="axis-card-title"><span className="axis-card-icon"><Database size={17} /></span><b>{dataset.name}</b></div><span className={`axis-badge ${dataset.enabled ? "success" : ""}`}>{dataset.enabled ? "Enabled" : "Paused"}</span></div>{dataset.description && <p>{dataset.description}</p>}<div className="axis-card-meta"><span>Polygon USDC</span><span title={dataset.owner}>{short(dataset.owner)}</span></div></Link>)}</div>; }
