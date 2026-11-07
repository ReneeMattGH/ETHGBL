import { afterEach, describe, expect, it, vi } from "vitest";
const { runQuery, client } = vi.hoisted(() => ({ runQuery: vi.fn(), client: {} }));
vi.mock("@arkiv-network/sdk/query", () => ({ runQuery }));
vi.mock("./runtime", () => ({ arkivReader: () => client, retryRead: (operation: () => Promise<unknown>) => operation() }));
import { queryArkiv } from "./arkiv-read";
afterEach(() => { runQuery.mockReset(); });

describe("server Arkiv query reads", () => {
  it("coalesces identical pending reads and keeps predicates, projections, pagination and counts isolated", async () => {
    runQuery.mockImplementation(async () => { await Promise.resolve(); return { entities: [], count: 0n, blockNumber: 1n }; });
    const base = { query: "trusted-owner AND dataset-a", select: { key: true }, limit: 25, offset: 0, count: true };
    await Promise.all([
      queryArkiv(base), queryArkiv(base),
      queryArkiv({ ...base, query: "trusted-owner AND dataset-b" }),
      queryArkiv({ ...base, select: { key: true, attributes: true } }),
      queryArkiv({ ...base, offset: 25 }),
      queryArkiv({ ...base, count: false }),
    ]);
    expect(runQuery).toHaveBeenCalledTimes(5);
    await queryArkiv(base);
    expect(runQuery).toHaveBeenCalledTimes(6);
  });
  it("does not retain failed reads", async () => {
    runQuery.mockRejectedValueOnce(new Error("node unavailable")).mockResolvedValueOnce({ entities: [], count: 0n, blockNumber: 2n });
    const request = { query: "trusted-scope", select: {}, count: true };
    await expect(queryArkiv(request)).rejects.toThrow("node unavailable");
    await expect(queryArkiv(request)).resolves.toMatchObject({ blockNumber: 2n });
  });
});
