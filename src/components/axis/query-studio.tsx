"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, LoaderCircle, MessageSquareText, Plus, SlidersHorizontal, X } from "lucide-react";
import { validateFilters } from "@/lib/axis/core";
import type { Dataset, Filters, QueryDefinition, QuerySourceDefinition, Transfer } from "@/lib/axis/model";
import { POLYGON_ACTIVITY_DATASET_KEY } from "@/lib/axis/catalog-sources";
import { api, useApi, PageIntro, Panel, DatasetSelect, Notice, Loading, TransferTable, CoverageNotice, QueryEvidence, Field, type QueryResult } from "./shared";
import { saveResultDataset, useAxisWallet, walletError } from "./wallet";
import { DatasetQueryFilters } from "./dataset-query-filters";
import { filtersForSchema, type DatasetQuerySchema } from "@/lib/axis/query-filters";
import { EnglishQueryComposer } from "./english-query-composer";
import { SnapshotPublisher } from "./swarm-snapshot";

type Selection = { id: number; datasetKey: string; filters: Filters };
type SchemaState = { datasetKey: string; data: DatasetQuerySchema | null; error: string | null };

function definitionFor(queries: QuerySourceDefinition[]): QueryDefinition {
  return { ...queries[0], ...(queries.length > 1 ? { queries } : {}) };
}

function matchesQuery(value: QueryResult | null, query: QueryDefinition | null) {
  if (!value || !query) return false;
  return query.queries
    ? JSON.stringify(value.sources?.map(source => source.datasetKey)) === JSON.stringify(query.queries.map(source => source.datasetKey))
    : value.dataset.key === query.datasetKey;
}

function useQueryExecution(query: QueryDefinition | null, offset: number, limit: number) {
  const [revision, setRevision] = React.useState(0);
  const body = query ? JSON.stringify({ ...query, offset, limit, mode: "page" }) : null;
  const requestKey = body ? `${revision}:${body}` : null;
  const [state, setState] = React.useState<{ key: string | null; data: QueryResult | null; error: string | null; loading: boolean }>({ key: null, data: null, error: null, loading: false });
  React.useEffect(() => {
    if (!body || !requestKey) { setState({ key: null, data: null, error: null, loading: false }); return; }
    let active = true;
    setState({ key: requestKey, data: null, error: null, loading: true });
    void api<QueryResult>("query", JSON.parse(body)).then(data => {
      if (active) setState({ key: requestKey, data, error: null, loading: false });
    }).catch(caught => {
      if (active) setState({ key: requestKey, data: null, error: walletError(caught), loading: false });
    });
    return () => { active = false; };
  }, [body, requestKey]);
  const current = state.key === requestKey ? state : { data: null, error: null, loading: Boolean(requestKey) };
  return { ...current, refresh: () => setRevision(value => value + 1) };
}

function QuerySourceFilters({ selection, index, multiple, datasets, disabled, showFilters, onDatasetChange, onFiltersChange, onRemove, onSchema }: {
  selection: Selection; index: number; multiple: boolean; datasets: Dataset[]; disabled: boolean; showFilters: boolean;
  onDatasetChange: (id: number, key: string) => void;
  onFiltersChange: (id: number, filters: Filters) => void;
  onRemove: (id: number) => void;
  onSchema: (id: number, state: SchemaState) => void;
}) {
  const schema = useApi<DatasetQuerySchema>(selection.datasetKey ? "schema/" + selection.datasetKey : null);
  const current = schema.data?.datasetKey === selection.datasetKey ? schema.data : null;
  React.useEffect(() => {
    onSchema(selection.id, { datasetKey: selection.datasetKey, data: current, error: schema.error });
  }, [selection.id, selection.datasetKey, current, schema.error, onSchema]);
  return <fieldset className="axis-query-source" disabled={disabled} aria-label={"Dataset " + (index + 1) + " filters"}>
    {multiple && <div className="axis-query-source-heading"><h3>{"Dataset " + (index + 1)}</h3><button type="button" className="axis-link-button" aria-label={"Remove dataset " + (index + 1)} onClick={() => onRemove(selection.id)}><X size={15} />Remove</button></div>}
    <div className="axis-form-stack">
      <DatasetSelect datasets={datasets} value={selection.datasetKey} disabled={disabled} onChange={key => onDatasetChange(selection.id, key)} />
      {selection.datasetKey && !current && !schema.error && <div role="status">Loading dataset filters...</div>}
      {schema.error && <Notice tone="error">{schema.error}<button type="button" className="axis-link-button" onClick={schema.refresh}>Retry schema</button></Notice>}
      {current && showFilters && <DatasetQueryFilters fields={current.filterFields ?? current.fields} filters={selection.filters} onChange={filters => onFiltersChange(selection.id, filters)} />}
    </div>
  </fieldset>;
}

export function QueryStudio() {
  const params = useSearchParams(), wallet = useAxisWallet();
  const catalog = useApi<{ datasets: Dataset[] }>("datasets");
  const [selections, setSelections] = React.useState<Selection[]>(() => {
    const keys = [...new Set(params.getAll("dataset").map(key => key.toLowerCase()))].filter(key => key && key !== POLYGON_ACTIVITY_DATASET_KEY).slice(0, 20);
    return (keys.length ? keys : [""]).map((datasetKey, id) => ({ id, datasetKey, filters: {} }));
  });
  const nextId = React.useRef(selections.length);
  const [inputMode, setInputMode] = React.useState<"manual" | "english">("manual"), [englishPrompt, setEnglishPrompt] = React.useState("");
  const [schemas, setSchemas] = React.useState<Record<number, SchemaState>>({});
  const [order, setOrder] = React.useState<"asc" | "desc">("desc");
  const [executed, setExecuted] = React.useState<QueryDefinition | null>(null);
  const [offset, setOffset] = React.useState(0), [limit, setLimit] = React.useState(25);
  const [title, setTitle] = React.useState(""), [description, setDescription] = React.useState("");
  const [savedDataset, setSavedDataset] = React.useState<string | null>(null), [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null), [error, setError] = React.useState<string | null>(null);
  const result = useQueryExecution(executed, offset, limit);
  const resultsRegion = React.useRef<HTMLDivElement>(null), revealResults = React.useRef(false);
  React.useEffect(() => {
    if (!revealResults.current || !executed && !error) return;
    if (!result.loading && (result.data || result.error || error)) revealResults.current = false;
    const frame = requestAnimationFrame(() => {
      const region = resultsRegion.current;
      region?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
      region?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [executed, error, result.loading, result.data, result.error]);
  const available = (catalog.data?.datasets ?? []).filter(dataset => dataset.key.toLowerCase() !== POLYGON_ACTIVITY_DATASET_KEY);
  const draft = definitionFor(selections.map(selection => ({ datasetKey: selection.datasetKey, filters: { ...selection.filters, order } })));
  const dirty = Boolean(executed && JSON.stringify(executed) !== JSON.stringify(draft));
  const currentResult = matchesQuery(result.data, executed) ? result.data : null;
  const ready = selections.every(selection => selection.datasetKey && schemas[selection.id]?.datasetKey === selection.datasetKey && schemas[selection.id]?.data && !schemas[selection.id]?.error);
  const canAdd = !busy && selections.length < 20 && selections.every(selection => selection.datasetKey) && available.some(dataset => !selections.some(selection => selection.datasetKey === dataset.key));
  const receiveSchema = React.useCallback((id: number, state: SchemaState) => {
    setSchemas(current => current[id]?.datasetKey === state.datasetKey && current[id]?.data === state.data && current[id]?.error === state.error ? current : { ...current, [id]: state });
  }, []);
  const resetResult = () => { revealResults.current = false; setExecuted(null); setOffset(0); setError(null); setMessage(null); setSavedDataset(null); };
  const changeDataset = (id: number, datasetKey: string) => {
    if (busy || selections.some(selection => selection.id !== id && datasetKey && selection.datasetKey === datasetKey)) return;
    setSelections(current => current.map(selection => selection.id === id ? { ...selection, datasetKey, filters: {} } : selection));
    resetResult();
  };
  const changeFilters = (id: number, filters: Filters) => {
    setSelections(current => current.map(selection => selection.id === id ? { ...selection, filters } : selection));
  };
  const addDataset = () => {
    if (!canAdd) return;
    const id = nextId.current++;
    setSelections(current => [...current, { id, datasetKey: "", filters: {} }]);
    resetResult();
  };
  const removeDataset = (id: number) => {
    if (busy || selections.length === 1) return;
    setSelections(current => current.filter(selection => selection.id !== id));
    resetResult();
  };
  const applyQuery = (sources: QuerySourceDefinition[], direction: "asc" | "desc", execute: boolean, generated = false) => {
    if (!ready || busy) return;
    revealResults.current = generated && execute;
    setError(null); setMessage(null); setSavedDataset(null);
    try {
      const queries = selections.map(selection => {
        const source = sources.find(source => source.datasetKey === selection.datasetKey);
        if (!source || sources.length !== selections.length) throw new Error("The selected datasets changed. Generate the query again.");
        const schema = schemas[selection.id].data!;
        try {
          const original = validateFilters({ ...source.filters, order: direction });
          const filters = validateFilters(filtersForSchema(original, schema.filterFields ?? schema.fields));
          if (generated && JSON.stringify(original) !== JSON.stringify(filters)) throw new Error("Dataset filters changed. Refresh the page and generate the query again.");
          return { datasetKey: selection.datasetKey, filters };
        }
        catch (caught) {
          const name = available.find(dataset => dataset.key === selection.datasetKey)?.name;
          throw new Error((selections.length > 1 ? (name ?? "Dataset") + ": " : "") + walletError(caught));
        }
      });
      const next = definitionFor(queries);
      if (execute && offset === 0 && JSON.stringify(executed) === JSON.stringify(next)) { result.refresh(); }
      setSelections(current => current.map((selection, index) => ({ ...selection, filters: queries[index].filters })));
      setOrder(direction); setOffset(0); setExecuted(execute ? next : null);
      if (!execute) setInputMode("manual");
    } catch (caught) { setError(walletError(caught)); }
  };
  const canSave = Boolean(executed && currentResult && !result.loading && !result.error && !busy && !dirty && title.trim());
  const save = async () => {
    if (!canSave || !executed) return;
    setBusy(true); setError(null); setMessage(null); setSavedDataset(null);
    try {
      const full = await api<QueryResult>("query", { ...executed, mode: "export" });
      if (!full.coverage.throughBlock || full.coverage.gaps.length || !full.entities) throw new Error("The query result is not verified. Execute it again before saving.");
      const account = wallet.address ?? await wallet.connect();
      const published = await saveResultDataset(account, {
        name: title, description, dataset: full.dataset, filters: executed.filters,
        fromBlock: full.scope.fromBlock, throughBlock: full.scope.toBlock, rows: full.entities.length,
        sources: full.sources?.map(source => ({ dataset: source.dataset, filters: source.filters, fromBlock: source.coverage.fromBlock, throughBlock: source.coverage.throughBlock! })),
      });
      setSavedDataset(published.entityKey); catalog.refresh(); setMessage("Dataset saved to My datasets.");
    } catch (caught) { setError(walletError(caught)); } finally { setBusy(false); }
  };
  const exportCsv = async () => {
    if (!executed || dirty || busy) return;
    setBusy(true); setError(null);
    try {
      const full = await api<QueryResult>("query", { ...executed, mode: "export" });
      const fields: (keyof Transfer)[] = [...(full.sources || full.dataset.resultSource?.scopes ? ["datasetKey" as const] : []), "sourceId", "blockNumber", "blockHash", "timestamp", "txHash", "logIndex", "sender", "recipient", "amountRaw", "amount"];
      const lines = [fields.join(","), ...(full.entities ?? []).map(row => fields.map(field => '"' + String(row[field] ?? "").replace(/"/g, '""') + '"').join(","))];
      const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" })), anchor = document.createElement("a");
      anchor.href = url; anchor.download = full.sources ? "axis-combined-results.csv" : "axis-usdc-transfers.csv"; anchor.click(); URL.revokeObjectURL(url);
      setMessage("Exported " + (full.entities?.length ?? 0) + " matching records from the complete verified scope.");
    } catch (caught) { setError(walletError(caught)); } finally { setBusy(false); }
  };
  const dashboardHref = draft.datasetKey
    ? "/dashboards/new?" + new URLSearchParams({ dataset: draft.datasetKey, filters: JSON.stringify(draft.filters), ...(draft.queries ? { queries: JSON.stringify(draft.queries) } : {}) }).toString()
    : "/dashboards/new";

  return <>
    <PageIntro title="Query Studio" />
    <div className={`axis-query-layout${inputMode === "english" && executed ? " axis-query-with-results" : ""}`}>
        <Panel title="Query definition" className="axis-query-editor" actions={<button type="button" className="axis-button secondary" disabled={!canAdd} onClick={addDataset}><Plus size={16} />Add dataset</button>}>
          <div className="axis-form-stack">
            <div className="axis-query-mode" role="group" aria-label="Query input mode"><button type="button" aria-pressed={inputMode === "manual"} disabled={busy} onClick={() => setInputMode("manual")}><SlidersHorizontal size={16} />Manual query</button><button type="button" aria-pressed={inputMode === "english"} disabled={busy} onClick={() => setInputMode("english")}><MessageSquareText size={16} />Ask in English</button></div>
            {selections.length > 1 && <p>Results appear in one table. Each dataset uses its own filters.</p>}
            {selections.map((selection, index) => <QuerySourceFilters
              key={selection.id + ":" + selection.datasetKey} selection={selection} index={index} multiple={selections.length > 1}
              datasets={available.filter(dataset => !selections.some(other => other.id !== selection.id && other.datasetKey === dataset.key))}
              disabled={busy} showFilters={inputMode === "manual"} onDatasetChange={changeDataset} onFiltersChange={changeFilters} onRemove={removeDataset} onSchema={receiveSchema}
            />)}
            {inputMode === "english" && <EnglishQueryComposer key={selections.map(selection => selection.datasetKey).join(":")} datasets={selections.flatMap(selection => { const dataset = available.find(dataset => dataset.key === selection.datasetKey); return dataset ? [dataset] : []; })} ready={ready} disabled={busy || result.loading} prompt={englishPrompt} onPromptChange={value => { setEnglishPrompt(value); resetResult(); }} onApply={(queries, execute) => applyQuery(queries, queries[0]?.filters.order ?? "desc", execute, true)} onManual={() => setInputMode("manual")} />}
            <div className="axis-form-grid">
              {inputMode === "manual" && <Field label="Row order"><select value={order} disabled={busy} onChange={event => setOrder(event.target.value as "asc" | "desc")}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></Field>}
              <Field label="Page size"><select value={limit} disabled={busy} onChange={event => { setLimit(Number(event.target.value)); setOffset(0); }}>{[10, 25, 50, 100].map(value => <option key={value}>{value}</option>)}</select></Field>
            </div>
            <div className="axis-actions">
              {inputMode === "manual" && <button className="axis-button" disabled={!ready || result.loading || busy} onClick={() => applyQuery(selections, order, true)}>{result.loading ? "Executing\u2026" : "Execute query"}</button>}
              <button className="axis-button secondary" disabled={!executed || !currentResult || result.loading || busy || dirty} onClick={() => void exportCsv()}>Export full result CSV</button>
              <Link className="axis-button axis-query-dashboard-action" href={dashboardHref} aria-disabled={selections.length > 1 && !ready} tabIndex={selections.length > 1 && !ready ? -1 : undefined} onClick={event => { if (selections.length > 1 && !ready) event.preventDefault(); }}>Build dashboard &rarr;</Link>
            </div>
          </div>
        </Panel>
      <Panel title="Save as dataset" className="axis-query-library">
        <div className="axis-form-stack">
          <Field label="Dataset name"><input value={title} maxLength={80} onChange={event => setTitle(event.target.value)} /></Field>
          <Field label="Dataset description"><textarea value={description} rows={3} maxLength={2000} onChange={event => setDescription(event.target.value)} /></Field>
          <button type="button" className="axis-button" disabled={!canSave} onClick={() => void save()}>{busy ? "Saving dataset..." : "Save as dataset"}</button>
          {savedDataset && <Link className="axis-inline-link" href={"/datasets/" + savedDataset}>Open saved dataset</Link>}
        </div>
      </Panel>
      <div ref={resultsRegion} className={`axis-query-main${inputMode === "english" ? " axis-query-english-results" : ""}`} role="region" aria-label="Query execution and results" tabIndex={-1}>
        {catalog.error && <Notice tone="error">{catalog.error}<button type="button" className="axis-link-button" onClick={catalog.refresh}>Retry datasets</button></Notice>}
        {dirty && <Notice>Query changed. Run again to update the results.</Notice>}
        {[result.error, error].filter(Boolean).map((item, index) => <Notice tone="error" key={index}>{item}</Notice>)}
        {message && <Notice tone="success">{message}</Notice>}
        {inputMode === "english" && executed && <Panel title="Run query" className="axis-query-execution" actions={<span className={`axis-badge ${result.error ? "danger" : result.loading ? "active" : "success"}`} role="status" aria-label="Query execution status">{result.loading ? <><LoaderCircle size={14} className="animate-spin" />Running on Arkiv</> : result.error ? "Execution failed" : <><Check size={14} />Completed</>}</span>}>
          {result.loading && <p>Fetching matching records from the selected datasets…</p>}
          {currentResult && <pre aria-label="Executed Arkiv query">{currentResult.executedQuery}</pre>}
          {result.error && <button type="button" className="axis-button secondary" onClick={result.refresh}>Run again</button>}
        </Panel>}
        {inputMode !== "english" && result.loading && !currentResult && <Loading />}
        {currentResult && <>
          {currentResult.sources ? <Notice>{currentResult.sources.length} datasets combined using verified source coverage.{!currentResult.coverage.complete && " Some sources have partial coverage."}</Notice> : <CoverageNotice coverage={currentResult.coverage} />}
          <Panel title={"Query results \u00b7 " + (currentResult.total ?? "\u2014") + " matching transfers"}>
            <TransferTable rows={currentResult.entities ?? []} sources={currentResult.recordDatasets} />
            <div className="axis-pagination">
              <button className="axis-button secondary" disabled={offset === 0 || result.loading || busy || dirty} onClick={() => setOffset(value => Math.max(0, value - limit))}>Previous</button>
              <span>{"Page " + (Math.floor(offset / limit) + 1) + " \u00b7 " + (currentResult.entities?.length ?? 0) + " rows shown"}</span>
              <button className="axis-button secondary" disabled={result.loading || busy || dirty || offset + limit >= Number(currentResult.total)} onClick={() => setOffset(value => value + limit)}>Next</button>
            </div>
          </Panel>
          <QueryEvidence result={currentResult} />
          {executed && <SnapshotPublisher key={JSON.stringify(executed)} query={executed} title={title || (currentResult.dataset.name + " snapshot").slice(0, 80)} description={description} disabled={dirty || busy || result.loading || Boolean(result.error)} onBusyChange={setBusy} />}
        </>}
      </div>
    </div>
  </>;
}
