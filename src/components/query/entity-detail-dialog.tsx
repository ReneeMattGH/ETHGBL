"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TypeBadge } from "@/components/ui/type-badge";
import { useCopy } from "@/hooks/use-copy";
import type { EntityDto } from "@/lib/arkiv/types";
import { formatBlock, formatValue } from "@/lib/format";
import { QueryCodeBlock } from "./query-editor";

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3 border-b border-border/60 py-2 last:border-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all font-mono text-[11.5px] text-foreground">{children}</dd>
    </div>
  );
}

function attributeDisplay(type: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" && (type === "addr" || type === "key" || type === "bytes")) {
    return value;
  }
  return formatValue(value);
}

export function EntityDetailDialog({
  entity,
  blockNumber,
  onOpenChange,
}: {
  entity: EntityDto | null;
  blockNumber: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { copy, copiedKey } = useCopy();
  const expired =
    entity?.expiresAt && blockNumber ? Number(entity.expiresAt) <= Number(blockNumber) : false;

  return (
    <Dialog open={Boolean(entity)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        {entity && (
          <>
            <DialogHeader className="border-b border-border/70 px-5 py-4 pr-12">
              <DialogTitle className="flex items-center gap-2">
                Entity
                {expired && (
                  <Badge variant="outline" className="border-red-500/30 text-red-600 dark:text-red-300">
                    Expired
                  </Badge>
                )}
                {entity.creationFlags?.readonly && (
                  <Badge variant="outline" className="text-muted-foreground">
                    Read-only
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2 break-all font-mono text-[11px]">
                {entity.key}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0"
                  onClick={() => void copy(entity.key, "Entity key copied")}
                  aria-label="Copy entity key"
                >
                  {copiedKey === entity.key ? <Check className="size-3" /> : <Copy className="size-3" />}
                </Button>
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="max-h-[calc(90vh-8.5rem)]">
              <div className="space-y-5 px-5 py-4">
                <section>
                  <h3 className="mb-1 text-[12px] font-semibold text-foreground">Entity fields</h3>
                  <dl>
                    <DetailRow label="Key">{entity.key}</DetailRow>
                    <DetailRow label="Owner">{entity.owner ?? "—"}</DetailRow>
                    <DetailRow label="Creator">{entity.creator ?? "—"}</DetailRow>
                    <DetailRow label="Created">{formatBlock(entity.createdAt)}</DetailRow>
                    <DetailRow label="Updated">{formatBlock(entity.updatedAt)}</DetailRow>
                    <DetailRow label="Expires">{formatBlock(entity.expiresAt)}</DetailRow>
                    <DetailRow label="Flags">
                      {entity.creationFlags
                        ? `raw ${entity.creationFlags.raw} · readonly ${entity.creationFlags.readonly} · permissionless ${entity.creationFlags.permissionlessExtension}`
                        : "—"}
                    </DetailRow>
                  </dl>
                </section>

                <section>
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="text-[12px] font-semibold text-foreground">
                      Attributes ({Object.keys(entity.attributes).length})
                    </h3>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="gap-1.5 text-muted-foreground"
                      onClick={() => void copy(JSON.stringify(entity.attributes, null, 2), "Attributes copied")}
                    >
                      <Copy className="size-3" />
                      Copy JSON
                    </Button>
                  </div>

                  {Object.keys(entity.attributes).length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-[12px] text-muted-foreground">
                      This entity has no attributes.
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-border/70">
                      <table className="w-full text-left">
                        <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 font-medium">Attribute</th>
                            <th className="px-3 py-2 font-medium">Type</th>
                            <th className="px-3 py-2 font-medium">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(entity.attributes).map(([name, entry]) => (
                            <tr key={name} className="border-t border-border/60">
                              <td className="px-3 py-2 font-mono text-[11.5px]">{name}</td>
                              <td className="px-3 py-2">
                                <TypeBadge
                                  type={entry.type}
                                  indexed={entity.attributeSchema[name]?.indexed}
                                />
                              </td>
                              <td className="max-w-[24rem] whitespace-pre-wrap break-all px-3 py-2 font-mono text-[11px] text-foreground/90">
                                {attributeDisplay(entry.type, entry.value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section>
                  <h3 className="mb-1 text-[12px] font-semibold text-foreground">Raw entity</h3>
                  <QueryCodeBlock code={JSON.stringify(entity, null, 2)} maxHeight="18rem" />
                </section>
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
