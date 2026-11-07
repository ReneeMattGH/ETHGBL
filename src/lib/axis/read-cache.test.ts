import { describe, expect, it, vi } from "vitest";
import { createReadCache, readCacheKey, READ_CACHE_STORAGE_KEY, READ_FRESH_MS, READ_MAX_AGE_MS } from "./read-cache";

function fixture() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  let time = 100_000;
  return { storage, values, cache: createReadCache(() => storage, () => time), tick: (ms: number) => { time += ms; }, now: () => time };
}

describe("public read cache", () => {
  it("restores exact data across reloads, supports background refresh age, and discards expired data", () => {
    const { cache, storage, tick, now } = fixture();
    const key = readCacheKey("query", { datasetKey: "a", filters: {}, mode: "analytics" })!;
    const value = { amountRaw: "123456789012345678901234567890", fetchedAt: "original-time", analytics: { transfers: 25 } };
    cache.put(key, value);
    tick(READ_FRESH_MS + 1);
    const reloaded = createReadCache(() => storage, now);
    reloaded.restore();
    expect(reloaded.peek(key)).toEqual({ value, updatedAt: 100_000 });
    tick(READ_MAX_AGE_MS);
    expect(reloaded.peek(key)).toBeNull();
    const expiredReload = createReadCache(() => storage, now);
    expiredReload.restore();
    expect(expiredReload.peek(key)).toBeNull();
  });

  it("isolates dataset, owner, filter, page, import, and API namespace", () => {
    const base = { datasetKey: "a", mode: "page", filters: { sender: "alice" }, offset: 0 };
    const keys = [readCacheKey("query", base), readCacheKey("query", { ...base, datasetKey: "b" }), readCacheKey("query", { ...base, filters: { sender: "bob" } }), readCacheKey("query", { ...base, offset: 25 }), readCacheKey("query", base, "/api/public/report/")];
    expect(new Set(keys).size).toBe(keys.length);
    expect(readCacheKey("datasets?owner=alice")).not.toBe(readCacheKey("datasets?owner=bob"));
    expect(readCacheKey("catalog/insights?item=dex&import=a")).not.toBe(readCacheKey("catalog/insights?item=dex&import=b"));
  });

  it("normalizes parameter order and refresh revisions without dropping source scope", () => {
    expect(readCacheKey("catalog/insights?view=curated&item=dex&revision=1")).toBe(readCacheKey("catalog/insights?revision=2&item=dex&view=curated"));
    expect(readCacheKey("query", { datasetKey: "a", filters: { sender: "alice", order: "asc" }, reportRevision: 1 })).toBe(readCacheKey("query", { reportRevision: 2, filters: { order: "asc", sender: "alice" }, datasetKey: "a" }));
  });

  it("never persists authorization, provider configuration, operational status, exports, or writes", () => {
    for (const path of ["challenge", "rpc", "config", "query-assistant", "ingestion", "ingestion/counts", "bulk/jobs", "swarm/status", "dashboard-deploy"]) expect(readCacheKey(path)).toBeNull();
    for (const path of ["query-assistant", "rpc", "ingestion", "swarm/upload"]) expect(readCacheKey(path, {})).toBeNull();
    expect(readCacheKey("query", { mode: "export" })).toBeNull();
  });

  it("invalidates browser copies after writes and ignores reads started before invalidation", () => {
    const { cache, storage } = fixture();
    const listener = vi.fn(); cache.onInvalidate(listener);
    cache.put("dataset", { enabled: true });
    const beforeWrite = cache.generation;
    cache.invalidate();
    cache.put("dataset", { enabled: true }, beforeWrite);
    expect(cache.peek("dataset")).toBeNull();
    expect(storage.getItem(READ_CACHE_STORAGE_KEY)).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
    cache.put("dataset", { enabled: false });
    expect(cache.peek("dataset")?.value).toEqual({ enabled: false });
  });

  it("bounds stored results and survives blocked or malformed storage", () => {
    const { cache, storage } = fixture();
    for (let index = 0; index < 90; index++) cache.put(String(index), "a".repeat(30_000));
    expect(storage.getItem(READ_CACHE_STORAGE_KEY)!.length).toBeLessThanOrEqual(1_500_000);
    expect(cache.peek("0")).toBeNull();
    expect(cache.peek("89")?.value).toHaveLength(30_000);
    storage.setItem(READ_CACHE_STORAGE_KEY, "broken json");
    expect(() => createReadCache(() => storage).restore()).not.toThrow();
    const blocked = createReadCache(() => { throw new Error("SecurityError"); });
    blocked.restore(); blocked.put("a", { count: 7 });
    expect(blocked.peek("a")?.value).toEqual({ count: 7 });
  });
});
