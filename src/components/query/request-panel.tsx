"use client";

import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/hooks/use-copy";
import type { QueryResultDto } from "@/lib/arkiv/types";
import { formatBlock, formatDateTime, formatDuration, formatInteger } from "@/lib/format";
import { QueryCodeBlock } from "./query-editor";

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/30 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all text-[12px] text-foreground">{value}</dd>
    </div>
  );
}

export function RequestPanel({ result }: { result: QueryResultDto }) {
  const { copy, copiedKey } = useCopy();

  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="absolute right-2 top-2 z-10">
          <Button
            variant="secondary"
            size="xs"
            className="gap-1.5"
            onClick={() => void copy(result.executedQuery, "Query copied")}
          >
            {copiedKey === result.executedQuery ? <Check className="size-3" /> : <Copy className="size-3" />}
            Copy
          </Button>
        </div>
        <QueryCodeBlock code={result.executedQuery} className="pr-20" />
      </div>

      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Item label="RPC method" value={<code className="font-mono">arkiv_query</code>} />
        <Item
          label="Network"
          value={`${result.network.label} · chain ${formatInteger(result.network.chainId)}`}
        />
        <Item label="RPC host" value={result.rpcHost} />
        <Item
          label="Page"
          value={`limit ${formatInteger(result.request.limit)} · offset ${formatInteger(result.request.offset)}`}
        />
        <Item
          label="Matching entities"
          value={result.count === null ? "count not requested" : formatInteger(result.count)}
        />
        <Item
          label="Page covered"
          value={`${formatInteger(result.entities.length)} rows returned`}
        />
        <Item label="Read at block" value={formatBlock(result.blockNumber)} />
        <Item label="Round trip" value={formatDuration(result.durationMs)} />
        <Item label="Fetched" value={formatDateTime(result.fetchedAt)} />
        <Item
          label="Selection"
          value="All entity fields · all attributes · attribute schema"
        />
        <Item label="Count projection" value={result.request.count ? "Requested" : "Not requested"} />
        <Item label="Schema filter" value="None — raw entity view" />
      </dl>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Pagination is offset-based against the immutable block shown above. If entities are created
        or expire between page requests, use a stable <code className="font-mono">ORDER BY</code>{" "}
        key (for example <code className="font-mono">$key:key ASC</code>) to keep pages aligned.
      </p>
    </div>
  );
}
