"use client";

import { useMemo, useSyncExternalStore } from "react";
import { hashDocument } from "@/lib/axis/core";
import type { QueryDefinition } from "@/lib/axis/model";
import { validateSnapshotDocument, type SnapshotReceipt } from "@/lib/axis/swarm-model";

const changed = "axis:swarm-receipt-changed";
export function snapshotRecoveryKey(query: QueryDefinition, owner: string) { return `axis:swarm-pending:v1:${owner.toLowerCase()}:${hashDocument(query)}`; }
export function decodeSnapshotReceipt(value: string | null, query: QueryDefinition, owner: string | null): SnapshotReceipt | null {
  if (!value || !owner || value.length > 20000) return null;
  try {
    const receipt = JSON.parse(value) as SnapshotReceipt, document = validateSnapshotDocument(receipt.document);
    const url = new URL(receipt.gatewayUrl);
    const keys = (query.queries ?? [query]).map(source => source.datasetKey.toLowerCase());
    if (document.publisher.toLowerCase() !== owner.toLowerCase() || JSON.stringify(keys) !== JSON.stringify(document.sourceDatasetKeys) || !["http:", "https:"].includes(url.protocol) || url.username || url.password || !Number.isFinite(Date.parse(receipt.verifiedAt))) return null;
    return { ...receipt, document };
  } catch { return null; }
}
function subscribe(notify: () => void) {
  window.addEventListener("storage", notify); window.addEventListener(changed, notify);
  return () => { window.removeEventListener("storage", notify); window.removeEventListener(changed, notify); };
}
export function usePendingSnapshot(query: QueryDefinition, owner: string | null) {
  const key = owner ? snapshotRecoveryKey(query, owner) : null;
  const serialized = useSyncExternalStore(subscribe, () => { try { return key ? localStorage.getItem(key) : null; } catch { return null; } }, () => null);
  return useMemo(() => decodeSnapshotReceipt(serialized, query, owner), [serialized, query, owner]);
}
export function rememberSnapshot(query: QueryDefinition, receipt: SnapshotReceipt) {
  try { localStorage.setItem(snapshotRecoveryKey(query, receipt.document.publisher), JSON.stringify(receipt)); window.dispatchEvent(new Event(changed)); } catch { /* In-memory recovery still works when browser storage is unavailable. */ }
}
export function forgetSnapshot(query: QueryDefinition, owner: string) {
  try { localStorage.removeItem(snapshotRecoveryKey(query, owner)); window.dispatchEvent(new Event(changed)); } catch { /* Storage may be disabled. */ }
}
