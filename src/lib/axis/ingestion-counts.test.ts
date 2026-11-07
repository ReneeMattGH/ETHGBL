import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
const owner = "0x" + "a".repeat(40);
vi.mock("@arkiv-network/sdk/query", () => ({ runQuery: query }));
vi.mock("./runtime", () => ({ arkivReader: () => ({}), writerAddress: () => "0x" + "a".repeat(40), retryRead: (action: () => Promise<unknown>) => action() }));
beforeEach(() => { vi.resetModules(); query.mockReset(); });

describe("Stored Arkiv ingestion counts", () => {
  it("counts physical rows directly, includes legacy records once and shares in-flight reads", async () => {
    query.mockImplementation(async (_reader, request) => {
      expect(request).toMatchObject({ select: {}, count: true });
      expect(request.query).toContain(`$owner = addr(${owner})`);
      const table = /tableId = str\('([^']+)'\)/.exec(request.query)?.[1];
      const counts: Record<string, bigint> = { "polygon-blocks": 2n, "token-transfers": 7n, "token-metadata": 2n, "token-lists": 4n };
      const count = table ? counts[table] ?? 0n : request.query.includes("axis.block.v1") ? 3n : request.query.includes("axis.transfer.v1") ? 11n : 1n;
      return { entities: [], blockNumber: 100n, count };
    });
    const { ingestionCounts } = await import("./ingestion-counts");
    const [first, second] = await Promise.all([ingestionCounts(), ingestionCounts()]);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ rows: "30", blocks: "5" });
    expect(first.tables).toEqual([
      { id: "token-transfers", name: "tokens.transfers", rows: "18" },
      { id: "polygon-blocks", name: "polygon.blocks", rows: "5" },
      { id: "token-lists", name: "tokens.lists", rows: "4" },
      { id: "token-metadata", name: "tokens.metadata", rows: "3" },
    ]);
    expect(query).toHaveBeenCalledTimes(38);
    expect(query.mock.calls.some(([, request]) => /stablecoin-transfers|dex-trades|lending-actions|prediction-trades|polygon-decoded'/.test(request.query))).toBe(false);
  });
  it("preserves large totals and fails instead of displaying missing counts as zero", async () => {
    const { ingestionCounts } = await import("./ingestion-counts");
    query.mockImplementation(async (_reader, request) => ({ entities: [], blockNumber: 1n, count: request.query.includes("tableId = str('polygon-blocks')") ? 9007199254740993n : 0n }));
    expect(await ingestionCounts()).toMatchObject({ rows: "9007199254740993", blocks: "9007199254740993" });
    vi.resetModules();
    query.mockResolvedValue({ entities: [], blockNumber: 1n });
    const fresh = await import("./ingestion-counts");
    await expect(fresh.ingestionCounts()).rejects.toThrow("valid stored-row count");
    query.mockResolvedValue({ entities: [], blockNumber: 1n, count: 0n });
    await expect(fresh.ingestionCounts()).resolves.toMatchObject({ rows: "0", blocks: "0", tables: [] });
  });
});
