import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./client-api";
import { afterAxisWrite, browserReadCache, readCacheKey } from "./read-cache";

afterEach(() => { browserReadCache.invalidate(); vi.unstubAllGlobals(); });
describe("cached API reads", () => {
  it("deduplicates simultaneous reads while explicit execution always fetches fresh results", async () => {
    const fetcher = vi.fn(async () => Response.json({ count: 2 }));
    vi.stubGlobal("fetch", fetcher);
    const body = { datasetKey: "a", mode: "page" };
    await Promise.all([api("query", body), api("query", body)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(browserReadCache.peek(readCacheKey("query", body))?.value).toEqual({ count: 2 });
    await api("query", body);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not replace a successful result with a failed refresh", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ datasets: ["verified"] })).mockResolvedValueOnce(Response.json({ error: "Arkiv unavailable" }, { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    await api("datasets");
    await expect(api("datasets")).rejects.toThrow("Arkiv unavailable");
    expect(browserReadCache.peek(readCacheKey("datasets"))?.value).toEqual({ datasets: ["verified"] });
  });
  it("only invalidates successful wallet writes", async () => {
    const key = readCacheKey("datasets");
    browserReadCache.put(key, { datasets: ["old"] });
    await expect(afterAxisWrite(Promise.reject(new Error("declined")))).rejects.toThrow("declined");
    expect(browserReadCache.peek(key)).not.toBeNull();
    await afterAxisWrite(Promise.resolve({ txHash: "verified-write" }));
    expect(browserReadCache.peek(key)).toBeNull();
  });
});
