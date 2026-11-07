import { beforeEach, describe, expect, it, vi } from "vitest";
import { bulkTableAvailable, type PublishedImport } from "./bulk/publication-model";
import { newestTableImport, POLYGON_ACTIVITY_DATASET_KEY } from "./catalog-sources";
const { scan, execute, imports, count } = vi.hoisted(() => ({ scan: vi.fn(), execute: vi.fn(), imports: vi.fn(), count: vi.fn() }));
vi.mock("./runtime", () => ({ writerAddress: () => "0x" + "a".repeat(40), arkivReader: vi.fn(), retryRead: vi.fn() }));
vi.mock("./store", async original => ({ ...await original<typeof import("./store")>(), scanEntities: scan, executeQuery: execute, countEntities: count, unpack: (entity: unknown) => entity }));
vi.mock("./bulk/published-store", async original => ({ ...await original<typeof import("./bulk/published-store")>(), listPublishedImports: imports, bulkPreviewValues: (entity: unknown) => ({ values: entity }) }));
import { catalogCollectionInsights } from "./catalog-insights";

const imported = (counts: Record<string, number>, through = "200", key = "0x" + "b".repeat(64)): PublishedImport => ({ key, name: "Verified Polygon import", status: "complete", owner: "0x" + "a".repeat(40), expiresAt: "999999999", document: { version: 1, runId: "test", sourceFingerprint: "test", configHash: "test", decoderHash: "test", tokens: [], counts, sourceHost: "Polygon", committedBlocks: 101, throughBlock: through, fromBlock: "100", toBlock: through, recordCount: 1000, sourceScope: "Verified records", retainedDays: 30 } });
beforeEach(() => { vi.clearAllMocks(); imports.mockResolvedValue([]); scan.mockResolvedValue([]); count.mockResolvedValue({ count: 0n }); });

describe("Platform catalog sources and collection analytics", () => {
  it("selects the latest verified table source and respects explicit unavailable coverage", () => {
    const old = imported({ "quickswap-swaps": 1 }, "150"), recent = imported({ "quickswap-swaps": 2 });
    expect(newestTableImport([old, recent], "dex-trades")).toBe(recent);
    const unavailable = { ...recent, document: { ...recent.document, tableCoverage: { "dex-trades": { state: "unavailable" as const, detail: "Decoder not run" } } } };
    expect(bulkTableAvailable(unavailable.document, "dex-trades")).toBe(false);
    expect(newestTableImport([unavailable], "dex-trades")).toBeUndefined();
    expect(newestTableImport([recent], "dex-trades", "unknown")).toBeUndefined();
  });
  it("uses the platform feed for transfers and distinct stablecoin charts", async () => {
    execute.mockResolvedValue({ analytics: { transfers: 2, amount: "3", uniqueSenders: 1, uniqueRecipients: 2, uniqueWallets: 3, mintCount: 0, series: [{ bucket: "2026-11-07", transfers: 2, amountRaw: "3000000" }], distribution: [{ bucket: "1–10 USDC", transfers: 2 }], topSenders: [{ address: "0xwallet", amountRaw: "3000000" }] }, scope: { fromBlock: "100", toBlock: "200" }, fetchedAt: "2026-11-07T00:00:00Z", executedQuery: "Verified platform feed" });
    const transfers = await catalogCollectionInsights("curated", "token-transfers");
    const stablecoins = await catalogCollectionInsights("curated", "stablecoins");
    expect(execute).toHaveBeenCalledWith(POLYGON_ACTIVITY_DATASET_KEY, {}, "analytics");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(transfers.charts[0].title).toBe("Token transfer activity");
    expect(stablecoins.charts[0]).toMatchObject({ title: "USDC transfer volume", decimals: 6, points: [{ value: "3000000" }] });
    const snapshot = await execute.mock.results[0].value;
    let finish!: (value: unknown) => void;
    const delayed = new Promise(resolve => { finish = resolve; });
    const actualNow = Date.now(), clock = vi.spyOn(Date, "now").mockReturnValue(actualNow + 21000);
    try {
      execute.mockReturnValueOnce(delayed);
      const first = catalogCollectionInsights("curated", "token-transfers");
      clock.mockReturnValue(actualNow + 52000);
      const second = catalogCollectionInsights("curated", "stablecoins");
      expect(execute).toHaveBeenCalledTimes(2);
      clock.mockReturnValue(actualNow);
      finish(snapshot); await Promise.all([first, second]);
      expect(execute).toHaveBeenCalledTimes(2);
    } finally { clock.mockRestore(); }
  });
  it("aggregates every verified DEX row and keeps protocols and units separate", async () => {
    imports.mockResolvedValue([imported({ "quickswap-swaps": 2, "uniswap_v3-swaps": 1 })]);
    scan.mockResolvedValue([{ protocol: "quickswap", contract: "pool-a", txHash: "tx-1", timestamp: "1794000000" }, { protocol: "quickswap", contract: "pool-a", txHash: "tx-2", timestamp: "1794000010" }, { protocol: "uniswap-v3", contract: "pool-b", txHash: "tx-2", timestamp: "1794000020" }]);
    const result = await catalogCollectionInsights("curated", "dex");
    expect(result.metrics).toContainEqual({ label: "Trades", value: "3" });
    expect(result.metrics).toContainEqual({ label: "Transactions", value: "2" });
    expect(result.charts[1]).toMatchObject({ kind: "flow", dimensions: { source: "Protocol", target: "Trading pool" }, points: [{ label: "quickswap", value: "2", values: ["2", "0"] }, { label: "uniswap-v3", value: "1", values: ["0", "1"] }] });
    expect(result.charts.every(chart => chart.unit === "Trades" && chart.decimals === 0)).toBe(true);
    const predicate = scan.mock.calls[0][0];
    expect(predicate).toContain("$owner = addr("); expect(predicate).toContain("ordinal < u64(1000)"); expect(predicate).toContain("blockNumber <= u64(200)");
  });
  it("uses lending action, reserve and wallet metrics rather than transfer totals", async () => {
    imports.mockResolvedValue([imported({ "aave-withdrawals": 1, "aave-borrows": 1 })]);
    scan.mockResolvedValue([{ event: "Withdraw", reserve: "USDC", user: "wallet-a", timestamp: "1794000000" }, { event: "Borrow", reserve: "DAI", user: "wallet-a", timestamp: "1794000001" }]);
    const result = await catalogCollectionInsights("curated", "lending");
    expect(result.metrics).toContainEqual({ label: "Reserve assets", value: "2" });
    expect(result.metrics).toContainEqual({ label: "Participating wallets", value: "1" });
    expect(result.charts.find(chart => chart.title === "Actions by type")?.kind).toBe("heatmap");
    expect(result.charts[1]).toMatchObject({ kind: "flow", dimensions: { source: "Action type", target: "Reserve asset" } });
  });
  it("supports the remaining curated reference and prediction collections when published", async () => {
    const samples = [
      ["chain-rpc", "rpc-registry", { chainId: "137", status: "listed; not probed", source: "registry" }, "Public RPC endpoints"],
      ["address-labels", "address-labels", { contract: "pool", protocol: "aave", role: "pool" }, "Labelled addresses"],
      ["signatures", "function-signatures", { selector: "0x12345678", signature: "method()", source: "ABI" }, "Function signatures"],
      ["wallet-ratings", "wallet-ratings", { contract: "wallet", model: "activity-v1", score: "50" }, "Rated wallets"],
      ["prediction", "prediction-trades", { maker: "wallet", taker: "wallet-2", txHash: "tx", family: "exchange" }, "Trade fills"],
    ] as const;
    for (const [entry, table, row, label] of samples) {
      const physical = table === "prediction-trades" ? "polymarket-trade_fills" : table;
      const snapshot = imported({ [physical]: 1 });
      snapshot.document.tableCoverage = { [table]: { state: "available", detail: "Verified" } };
      imports.mockResolvedValue([snapshot]); scan.mockResolvedValue([row]);
      const result = await catalogCollectionInsights("curated", entry);
      expect(result.status).toBe("available");
      expect(result.metrics).toContainEqual({ label, value: "1" });
      expect(result.charts.length).toBeGreaterThan(0);
    }
  });
  it("does not manufacture analytics for missing collections or expired rows", async () => {
    expect(await catalogCollectionInsights("curated", "prediction")).toMatchObject({ status: "not-indexed", metrics: [], charts: [] });
    expect(scan).not.toHaveBeenCalled();
    imports.mockResolvedValue([imported({ "quickswap-swaps": 3 })]); scan.mockResolvedValue([{}]);
    await expect(catalogCollectionInsights("curated", "dex")).rejects.toThrow("coverage differs");
    await expect(catalogCollectionInsights("__proto__", "dex")).rejects.toThrow("Unknown");
    await expect(catalogCollectionInsights("curated", "not-a-collection")).rejects.toThrow("Unknown");
  });
});
