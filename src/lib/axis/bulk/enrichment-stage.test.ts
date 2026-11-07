import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeAbiParameters, parseAbi, toFunctionSelector } from "viem";
import { config, fixtureSource, tokenA } from "./fixtures.test-helper";
import { extractStage } from "./staging";
import { decodeStageProtocols } from "./protocol-stage";
import { DEPLOYMENTS } from "./protocols";
import { RpcFailure, type RpcSource } from "./rpc";
import { enrichStage, parseReferenceJson, verifyEnrichment } from "./enrichment-stage";
import { exportEnrichmentParquet } from "./parquet";

const directories: string[] = [];
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });
describe("Enrichment evidence and replay", () => {
  it("preserves reference numeric lexemes without changing quoted values", () => {
    expect(parseReferenceJson('{"safe":137,"large":123456789012345678901,"decimal":1.0000000000000001,"exp":1e20,"text":"137 and \\"0.3\\""}')).toEqual({ safe: 137, large: "123456789012345678901", decimal: "1.0000000000000001", exp: "1e20", text: '137 and "0.3"' });
  });
  it("replays offline, records denied traces as unavailable and rejects tampered evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "axis-enrichment-test-")); directories.push(directory);
    const base = fixtureSource(), selectors = Object.fromEntries(parseAbi(["function getPool() view returns(address)", "function getReservesList() view returns(address[])"]).filter(x => x.type === "function").map(f => [f.name, toFunctionSelector(f)]));
    const source: RpcSource = { ...base.source, read: async <T>(method: string, params: unknown[]): Promise<T> => {
      if (method === "debug_traceTransaction") throw new RpcFailure("Trace method is not available on this tier", -32601);
      if (method === "eth_call") {
        const call = params[0] as { to: string; data: string };
        if (call.to === DEPLOYMENTS.aaveV3.provider && call.data === selectors.getPool) return encodeAbiParameters([{ type: "address" }], [DEPLOYMENTS.aaveV3.pool]) as T;
        if (call.to === DEPLOYMENTS.aaveV3.pool) return (call.data === selectors.getReservesList ? encodeAbiParameters([{ type: "address[]" }], [[tokenA as `0x${string}`]]) : encodeAbiParameters([{ type: "uint256" }], [10n ** 27n])) as T;
      }
      return base.source.read<T>(method, params);
    } };
    await extractStage(directory, config, source); await decodeStageProtocols(directory, source);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const value = url.includes("tokens.uniswap") ? { name: "Fixture list", version: { major: 1, minor: 0, patch: 0 }, tokens: [{ chainId: 137, address: tokenA, symbol: "TEST", name: "Fixture", decimals: 6 }] } : url.includes("ethereum-lists") ? { chainId: 137, name: "Polygon", nativeCurrency: { symbol: "POL", decimals: 18 }, rpc: ["https://public.invalid", "https://user:pass@private.invalid", "https://private.invalid?key=secret", "https://private.invalid/${KEY}"] } : { message: "Not verified" };
      return new Response(JSON.stringify(value), { status: url.includes("sourcify.dev") ? 404 : 200 });
    }));
    const result = await enrichStage(directory, source, true);
    expect(result.counts).toMatchObject({ "rpc-registry": 1, "token-lists": 1, "aave-reserves": 1, "wallet-ratings": 1, "polygon-signatures": 2 });
    expect(result.tableCoverage["polygon-traces"]?.state).toBe("unavailable");
    expect(result.rows.find(r => r.tableId === "aave-reserves")?.payload).toMatchObject({ normalizedIncome: "1000000000000000000000000000" });
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Offline verification must not fetch"); }));
    expect((await verifyEnrichment(directory)).fingerprint).toBe(result.fingerprint);
    const exported = await exportEnrichmentParquet(directory);
    expect(exported.tables.find(t => t.tableId === "aave-reserves")?.rows).toBe(1);
    expect(exported.tables.find(t => t.tableId === "polygon-traces")?.rows).toBe(0);
    expect(exported.tableCoverage?.["polygon-traces"]?.state).toBe("unavailable");
    const path = join(directory, "enrichment", "evidence.json"), saved = JSON.parse(await readFile(path, "utf8"));
    saved[Object.keys(saved)[0]].value = { corrupted: true }; await writeFile(path, JSON.stringify(saved));
    await expect(verifyEnrichment(directory)).rejects.toThrow("checksum/identity mismatch");
  });
});
