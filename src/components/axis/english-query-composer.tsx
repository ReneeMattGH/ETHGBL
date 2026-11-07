"use client";

import * as React from "react";
import { LoaderCircle, Pencil, Play } from "lucide-react";
import { formatUnits } from "viem";
import type { Dataset, QuerySourceDefinition } from "@/lib/axis/model";
import type { EnglishQueryPreview } from "@/lib/axis/english-query";
import { attributeLabel } from "@/lib/axis/query-filters";
import { api, Field, Notice, useApi } from "./shared";

function filterLines(query: QuerySourceDefinition) {
  const filters = query.filters, lines: string[] = [];
  if (filters.sender) lines.push(`Sender = ${filters.sender}`);
  if (filters.recipient) lines.push(`Recipient = ${filters.recipient}`);
  if (filters.fromTime) lines.push(`From ${new Date(Number(filters.fromTime) * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC")}`);
  if (filters.toTime) lines.push(`Through ${new Date(Number(filters.toTime) * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC")}`);
  for (const condition of filters.conditions ?? []) lines.push(condition.field === "amountRaw" ? `Transfer amount ${condition.operator} ${formatUnits(BigInt(condition.value), 6)} USDC` : `${attributeLabel(condition.field)} ${condition.operator} ${condition.value}`);
  if (!lines.length) lines.push("All records within verified coverage");
  return lines;
}

export function EnglishQueryComposer({ datasets, ready, disabled, prompt, onPromptChange, onApply, onManual }: {
  datasets: Dataset[]; ready: boolean; disabled: boolean; prompt: string;
  onPromptChange: (value: string) => void; onApply: (queries: QuerySourceDefinition[], execute: boolean) => void; onManual: () => void;
}) {
  const configuration = useApi<{ configured: boolean; provider: string }>("query-assistant");
  const [preview, setPreview] = React.useState<EnglishQueryPreview | null>(null), [error, setError] = React.useState<string | null>(null), [generating, setGenerating] = React.useState(false);
  const controller = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => controller.current?.abort(), []);
  const cancel = () => { controller.current?.abort(); controller.current = null; setGenerating(false); };
  const changePrompt = (value: string) => { cancel(); setPreview(null); setError(null); onPromptChange(value); };
  const generate = async (execute = false) => {
    if (!ready || disabled || !configuration.data?.configured || prompt.trim().length < 5) return;
    cancel(); const request = new AbortController(); controller.current = request;
    setGenerating(true); setError(null); setPreview(null);
    try {
      const response = await api<EnglishQueryPreview>("query-assistant", { prompt, datasetKeys: datasets.map(dataset => dataset.key) }, request.signal);
      if (!request.signal.aborted && controller.current === request) {
        setPreview(response);
        if (execute && response.status === "ready") onApply(response.queries, true);
      }
    } catch (caught) {
      if (!request.signal.aborted && controller.current === request) setError(caught instanceof Error ? caught.message : "Could not generate this query.");
    } finally {
      if (controller.current === request) { controller.current = null; setGenerating(false); }
    }
  };
  return <section className="axis-english-composer" aria-label="Ask in English">
    <Field label="Describe the records you want"><textarea className="axis-english-input" value={prompt} maxLength={2000} rows={4} disabled={disabled} placeholder="Show USDC transfers above 100 USDC from the last 7 days, newest first." onChange={event => changePrompt(event.target.value)} /></Field>
    <div className="axis-english-compose-actions"><span>{prompt.length.toLocaleString()} / 2,000</span><div className="axis-actions">
      {generating && <button type="button" className="axis-button secondary" onClick={cancel}>Cancel</button>}
      <button type="button" className="axis-button secondary" disabled={!ready || disabled || generating || !configuration.data?.configured || prompt.trim().length < 5} onClick={() => void generate()}>Generate query</button>
      <button type="button" className="axis-button" disabled={!ready || disabled || generating || !configuration.data?.configured || prompt.trim().length < 5} onClick={() => void generate(true)}>{generating ? <><LoaderCircle size={16} className="animate-spin" />Generating query…</> : <><Play size={15} />Execute query</>}</button>
    </div></div>
    {configuration.error && <Notice tone="error">{configuration.error}<button type="button" className="axis-link-button" onClick={configuration.refresh}>Try again</button></Notice>}
    {configuration.data && !configuration.data.configured && <Notice>English queries are not available yet.<div className="axis-actions"><button type="button" className="axis-link-button" onClick={onManual}>Use Manual query</button><button type="button" className="axis-link-button" onClick={configuration.refresh}>Check availability</button></div></Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {preview?.status === "clarification" && <div className="axis-english-clarification" role="status"><h3>Clarify your request</h3><p>{preview.summary}</p><ul>{preview.questions.map(question => <li key={question}>{question}</li>)}</ul></div>}
    {preview?.status === "ready" && <section className="axis-english-review" aria-label="Generated query review">
      <header><h3>Review query</h3><span>{preview.queries[0].filters.order === "asc" ? "Oldest first" : "Newest first"}</span></header>
      <p>{preview.summary}</p>
      <div className="axis-english-scopes">{preview.queries.map(query => <div key={query.datasetKey}><h4>{datasets.find(dataset => dataset.key === query.datasetKey)?.name ?? "Selected dataset"}</h4><ul>{filterLines(query).map(line => <li key={line}>{line}</li>)}</ul></div>)}</div>
      <details className="axis-english-native"><summary>Generated Arkiv query</summary><pre>{preview.nativeQuery}</pre><p>Verified coverage is checked again when you run.</p></details>
      <div className="axis-actions"><button type="button" className="axis-button" disabled={disabled || !ready} onClick={() => onApply(preview.queries, true)}><Play size={15} />Run query</button><button type="button" className="axis-button secondary" disabled={disabled || !ready} onClick={() => onApply(preview.queries, false)}><Pencil size={15} />Edit manually</button></div>
    </section>}
  </section>;
}
