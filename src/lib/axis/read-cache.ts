// Browser-only copies of successful public reads. The network remains authoritative.
export const READ_FRESH_MS = 30_000;
export const READ_MAX_AGE_MS = 5 * 60_000;
export const READ_CACHE_STORAGE_KEY = "axis:read-cache:v1";
const MAX_ENTRIES = 80;
const MAX_CHARS = 1_500_000;
export type ReadEntry<T = unknown> = { value: T; updatedAt: number };
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

export function readCacheKey(path: string | null, body?: unknown, basePath = "/api/axis/"): string | null {
  if (!path) return null;
  const url = new URL(path, "https://axis.invalid/");
  const endpoint = url.pathname.slice(1);
  const record = body as Record<string, unknown> | undefined;
  if (body !== undefined) {
    if (endpoint !== "query" || !record || ![undefined, "page", "analytics"].includes(record.mode as string | undefined)) return null;
  } else if (!/^(datasets|dashboards|schema|queries)(\/|$)/.test(endpoint) && !["bulk/imports", "catalog/source", "catalog/insights", "catalog/preview"].includes(endpoint) && !/^swarm\/snapshots(\/|$)/.test(endpoint)) return null;
  // Revisions request a refresh; they don't change the meaning of the cached data.
  url.searchParams.delete("revision");
  url.searchParams.sort();
  const normalizedBody = record ? Object.fromEntries(Object.entries(record).filter(([key]) => key !== "reportRevision")) : undefined;
  return `${basePath}${url.pathname.slice(1)}${url.search}:${JSON.stringify(canonical(normalizedBody))}`;
}

export function createReadCache(storage: () => Storage | undefined = () => undefined, now = Date.now) {
  const entries = new Map<string, ReadEntry>();
  const listeners = new Set<() => void>();
  const invalidationListeners = new Set<() => void>();
  let restored = false, generation = 0;
  const usable = (entry: ReadEntry) => Number.isFinite(entry.updatedAt) && entry.updatedAt <= now() && now() - entry.updatedAt < READ_MAX_AGE_MS;
  const emit = () => { for (const listener of listeners) listener(); };
  const persist = () => {
    const rows = [...entries].filter(([, entry]) => usable(entry));
    while (rows.length > MAX_ENTRIES) rows.shift();
    let serialized = JSON.stringify(rows);
    while (serialized.length > MAX_CHARS && rows.length) { rows.shift(); serialized = JSON.stringify(rows); }
    const retained = new Set(rows.map(([key]) => key));
    for (const key of entries.keys()) if (!retained.has(key)) entries.delete(key);
    // Storage may be disabled or full. Memory caching still works in those browsers.
    try { storage()?.setItem(READ_CACHE_STORAGE_KEY, serialized); } catch { /* best effort */ }
  };
  return {
    get generation() { return generation; },
    restore() {
      if (restored) return;
      restored = true;
      try {
        const parsed: unknown = JSON.parse(storage()?.getItem(READ_CACHE_STORAGE_KEY) ?? "[]");
        if (!Array.isArray(parsed)) return;
        for (const row of parsed.slice(-MAX_ENTRIES)) {
          if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== "string") continue;
          const entry = row[1] as ReadEntry | null;
          if (entry && Object.hasOwn(entry, "value") && usable(entry) && !entries.has(row[0])) entries.set(row[0], entry);
        }
        persist(); emit();
      } catch { /* ignore invalid browser storage */ }
    },
    peek<T>(key: string | null): ReadEntry<T> | null {
      const entry = key ? entries.get(key) : undefined;
      return entry && usable(entry) ? entry as ReadEntry<T> : null;
    },
    put(key: string | null, value: unknown, expectedGeneration = generation) {
      if (!key || expectedGeneration !== generation) return;
      entries.delete(key);
      entries.set(key, { value, updatedAt: now() });
      persist(); emit();
    },
    invalidate() {
      generation++; entries.clear();
      try { storage()?.removeItem(READ_CACHE_STORAGE_KEY); } catch { /* best effort */ }
      for (const listener of invalidationListeners) listener();
      emit();
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    onInvalidate(listener: () => void) { invalidationListeners.add(listener); return () => { invalidationListeners.delete(listener); }; },
  };
}

export const browserReadCache = createReadCache(() => typeof window === "undefined" ? undefined : window.sessionStorage);
export const invalidateAxisReads = () => browserReadCache.invalidate();
export async function afterAxisWrite<T>(write: Promise<T>): Promise<T> {
  const result = await write;
  invalidateAxisReads();
  return result;
}
