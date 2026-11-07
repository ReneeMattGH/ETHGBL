import { afterEach, describe, expect, it, vi } from "vitest";
import { rpcSource } from "./rpc";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("Bounded source RPC", () => {
  it("rejects mismatched response IDs, missing results and oversized responses", async () => {
    for (const body of [{ jsonrpc: "2.0", id: 99, result: [] }, { jsonrpc: "2.0", id: 1 }, { jsonrpc: "2.0", id: 1, result: "x".repeat(200) }]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body))));
      await expect(rpcSource("https://rpc.invalid", { maxBytes: 100, attempts: 1 }).read("eth_chainId", [])).rejects.toThrow();
    }
  });
  it("keeps provider errors sanitized, including failures returned with HTTP 400", async () => {
    vi.stubEnv("POLYGON_RPC_URL", "https://rpc.invalid/v2/secret-provider-token");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not supported https://rpc.invalid/v2/secret-provider-token secret-provider-token" } }), { status: 400 })));
    await expect(rpcSource(process.env.POLYGON_RPC_URL).read("debug_traceTransaction", [])).rejects.toMatchObject({ code: -32601, message: expect.not.stringContaining("secret-provider-token") });
  });
  it("does not retry persistent method failures", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } })));
    vi.stubGlobal("fetch", fetch);
    await expect(rpcSource("https://rpc.invalid").read("eth_getBlockReceipts", [])).rejects.toMatchObject({ code: -32601 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
