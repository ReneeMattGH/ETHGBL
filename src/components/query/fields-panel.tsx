"use client";

import { TableProperties } from "lucide-react";
import { TypeBadge } from "@/components/ui/type-badge";
import type { DatasetField } from "@/lib/visualization/fields";
import { formatInteger } from "@/lib/format";

export function FieldsPanel({ fields, entityCount }: { fields: DatasetField[]; entityCount: number }) {
  if (fields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/70 py-10 text-center">
        <TableProperties className="mb-2 size-5 text-muted-foreground" />
        <p className="text-[13px] text-muted-foreground">No fields to inspect in this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border/70">
        <table className="w-full min-w-[640px] text-left">
          <thead className="bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Field</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Indexed</th>
              <th className="px-3 py-2 font-medium">Presence</th>
              <th className="px-3 py-2 font-medium">Sample values</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.name} className="border-t border-border/60">
                <td className="px-3 py-2">
                  <div className="font-mono text-[11.5px] text-foreground">{field.name}</div>
                  <div className="text-[10.5px] text-muted-foreground">{field.label}</div>
                </td>
                <td className="px-3 py-2">
                  <TypeBadge type={field.type} />
                </td>
                <td className="px-3 py-2 text-[11.5px] text-muted-foreground">
                  {field.indexed === null ? "—" : field.indexed ? "Yes" : "No"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.round(field.presence * 100)}%` }}
                      />
                    </div>
                    <span className="tabular text-[10.5px] text-muted-foreground">
                      {Math.round(field.presence * 100)}%
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground/70">
                    {formatInteger(field.presentCount)} / {formatInteger(entityCount)} entities
                  </div>
                </td>
                <td className="px-3 py-2">
                  {field.sampleValues.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {field.sampleValues.map((sample, index) => (
                        <span
                          key={`${field.name}-${index}`}
                          className="max-w-36 truncate rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground/80"
                          title={sample}
                        >
                          {sample}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Types come from each entity&apos;s <code className="font-mono">$attributeSchema</code>{" "}
        projection. Presence is measured across the {formatInteger(entityCount)} entities returned in
        this page, not the full match count.
      </p>
    </div>
  );
}
