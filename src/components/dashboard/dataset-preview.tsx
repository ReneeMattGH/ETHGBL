"use client";

import * as React from "react";
import { Database, ScanSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TypeBadge } from "@/components/ui/type-badge";
import type { QueryResultDto } from "@/lib/arkiv/types";
import { formatBlock, formatInteger } from "@/lib/format";
import { displayAttributeValue, inferFields } from "@/lib/visualization/fields";

export function DatasetPreview({ result }: { result: QueryResultDto }) {
  const fields = React.useMemo(() => inferFields(result.entities), [result]);
  const attributeFields = fields
    .filter((field) => field.kind === "attribute" && field.presentCount > 0)
    .sort((a, b) => b.presence - a.presence)
    .slice(0, 4);
  const preview = result.entities.slice(0, 5);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-border/60 bg-background/30 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Database className="size-3" />
          <span className="text-foreground">{formatInteger(result.count ?? result.entities.length)}</span>
          {result.count === null ? "rows returned" : "matching entities"}
        </span>
        <span className="text-border">·</span>
        <span>{formatInteger(result.entities.length)} loaded</span>
        <span className="text-border">·</span>
        <span>block {formatBlock(result.blockNumber)}</span>
        <span className="text-border">·</span>
        <span>{fields.length} fields discovered</span>
      </div>

      <div className="flex flex-wrap gap-1">
        {fields.map((field) => (
          <span
            key={field.name}
            className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/20 px-1.5 py-1"
          >
            <span className="font-mono text-[10px] text-foreground/85">{field.name}</span>
            <TypeBadge type={field.type} />
            {field.indexed && <span className="text-[8.5px] uppercase text-muted-foreground">idx</span>}
            <span className="tabular text-[9px] text-muted-foreground">
              {Math.round(field.presence * 100)}%
            </span>
          </span>
        ))}
      </div>

      {preview.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center text-[12px] text-muted-foreground">
          This query returned no entities, so there is nothing to visualize.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/70">
          <table className="w-full min-w-[640px] text-left">
            <thead className="bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Entity</th>
                {attributeFields.map((field) => (
                  <th key={field.name} className="px-3 py-2 font-medium">
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] normal-case">{field.name}</span>
                      <TypeBadge type={field.type} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((entity) => (
                <tr key={entity.key} className="border-t border-border/60">
                  <td className="px-3 py-2 font-mono text-[10.5px] text-foreground">
                    {entity.key.slice(0, 10)}…{entity.key.slice(-6)}
                  </td>
                  {attributeFields.map((field) => {
                    const entry = entity.attributes[field.name];
                    return (
                      <td
                        key={field.name}
                        className="max-w-[14rem] truncate px-3 py-2 font-mono text-[10.5px] text-foreground/80"
                        title={entry ? displayAttributeValue(entry.type, entry.value, false) : undefined}
                      >
                        {entry ? displayAttributeValue(entry.type, entry.value) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
        <ScanSearch className="size-3" />
        Previewing {preview.length} of {formatInteger(result.entities.length)} rows returned from
        the live node. Saved dashboards poll this same dataset.
        <Badge variant="outline" className="ml-1 h-4 px-1 text-[9px]">
          count {result.count === null ? "off" : "on"}
        </Badge>
      </p>
    </div>
  );
}
