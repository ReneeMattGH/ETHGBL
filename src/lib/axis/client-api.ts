import { browserReadCache, readCacheKey } from "./read-cache";

const pendingReads = new Map<string, Promise<unknown>>();

// Explicit API calls always read the network; useApi controls cache reuse for views.
export async function api<T>(path: string, body?: unknown, signal?: AbortSignal, basePath = "/api/axis/"): Promise<T> {
  browserReadCache.restore();
  const read = body === undefined || path === "query" && (body as { mode?: string }).mode !== "export";
  const generation = browserReadCache.generation;
  const requestKey = `${generation}:${basePath}${path}:${JSON.stringify(body)}`;
  const existing = read ? pendingReads.get(requestKey) : undefined;
  if (existing) return existing as Promise<T>;
  const request = (async () => {
    const response = await fetch(`${basePath}${path}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: read ? undefined : signal, cache: "no-store" });
    const value = await response.json();
    if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : "AXIS request failed.");
    browserReadCache.put(readCacheKey(path, body, basePath), value, generation);
    if (!read && path !== "query" && path !== "query-assistant") browserReadCache.invalidate();
    return value as T;
  })();
  if (read) pendingReads.set(requestKey, request);
  try { return await request; } finally { if (pendingReads.get(requestKey) === request) pendingReads.delete(requestKey); }
}
