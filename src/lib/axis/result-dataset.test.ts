import { beforeEach, describe, expect, it, vi } from "vitest";
import { stringToHex } from "viem";
import type { Entity } from "@arkiv-network/sdk";
import type { Dataset } from "./model";
import { USDC } from "./model";

const { runQuery } = vi.hoisted(() => ({ runQuery: vi.fn() }));
vi.mock("@arkiv-network/sdk/query", () => ({ runQuery }));
vi.mock("./runtime", () => ({ writerAddress: () => `0x${"a".repeat(40)}`, arkivReader: () => ({}), retryRead: (operation: () => unknown) => operation() }));
vi.mock("./queue", () => ({ readState: async () => null }));
import { coverageSummary, datasetOf, executeQuery, filteredQuery } from "./store";

const sourceKey = `0x${"1".repeat(64)}`, savedKey = `0x${"2".repeat(64)}`, owner = `0x${"a".repeat(40)}`;
const source = { key: sourceKey, owner, creator: owner, expiresAt: "99999999", name: "Source", description: "", chainId: 137, contract: USDC, writer: owner, startBlock: "10", endBlock: "0", enabled: true, continuous: true, createdAt: "2026-11-07T00:00:00Z" } satisfies Dataset;
const saved: Dataset = { ...source, key: savedKey, name: "Treasury", endBlock: "20", continuous: false, resultSource: { datasetKey: sourceKey, filters: [{ sender: owner }], rows: 2 } };
function entity(dataset: Dataset): Entity {
  const attributes = Object.fromEntries(Object.entries({ ...dataset, sourceTime: "1794000000" }).map(([name, value]) => [name, { type: typeof value === "boolean" ? "bool" : "str", value }]));
  attributes.document = { type: "bytes", value: stringToHex(JSON.stringify({ description: dataset.description, resultSource: dataset.resultSource })) };
  return { ...dataset, attributes } as unknown as Entity;
}
beforeEach(() => {
  runQuery.mockReset();
  runQuery.mockImplementation(async (_reader, { query }: { query: string }) => {
    if (query.includes("axis.dataset.v1")) return { entities: [entity(query.includes(savedKey) ? saved : source)], count: 1n, blockNumber: 1n };
    if (query.includes("axis.coverage.v1")) return { entities: [{ key: sourceKey, owner, creator: owner, expiresAt: 99999999n, attributes: { fromBlock: { value: "10" }, toBlock: { value: "40" }, rows: { value: "200" }, contentHash: { value: sourceKey }, document: { type: "bytes", value: stringToHex(JSON.stringify({ blockHashes: {}, transactionHashes: [], verifiedAt: "2026-11-07T00:00:00Z" })) } } }], count: 1n, blockNumber: 1n };
    if (query.includes("axis.transfer.v1")) return { entities: [], count: query.includes("blockNumber <= u64(20)") ? 2n : 200n, blockNumber: 1n };
    return { entities: [], count: 0n, blockNumber: 1n };
  });
});

describe("Saved result dataset reads", () => {
  it("keeps the saved range and intersects source filters with new filters", () => {
    const query = filteredQuery(saved, { throughBlock: "20", gaps: [] } as unknown as Parameters<typeof filteredQuery>[1], { sender: `0x${"b".repeat(40)}` });
    expect(query).toContain(`datasetKey = key(${sourceKey})`);
    expect(query).not.toContain(`datasetKey = key(${savedKey})`);
    expect(query).toContain("blockNumber <= u64(20)");
    expect(query).toContain(`sender = addr(${owner}) AND sender = addr(0x${"b".repeat(40)})`);
  });
  it("opens a saved dataset against original records without widening its range as the source grows", async () => {
    const result = await executeQuery(savedKey, {}, "page");
    expect(result.dataset.key).toBe(savedKey);
    expect(result.total).toBe("2");
    expect(result.scope).toMatchObject({ fromBlock: "10", toBlock: "20" });
    expect(result.coverage).toMatchObject({ complete: true, expectedRows: 2, actualRows: 2 });
    expect(result.executedQuery).toContain(`datasetKey = key(${sourceKey})`);
    expect(result.executedQuery).toContain(`sender = addr(${owner})`);
  });
  it("blocks reads when saved source records no longer match the saved count", async () => {
    await expect(coverageSummary({ ...saved, resultSource: { ...saved.resultSource!, rows: 3 } })).resolves.toMatchObject({ complete: false, gaps: [expect.stringContaining("changed or expired")] });
  });
  it("rejects recursive source definitions and malformed scopes", async () => {
    await expect(coverageSummary({ ...saved, resultSource: { ...saved.resultSource!, datasetKey: savedKey } })).rejects.toThrow("original source");
    expect(() => datasetOf(entity({ ...saved, endBlock: "9" }))).toThrow("Invalid saved dataset scope");
    expect(() => datasetOf(entity({ ...saved, continuous: true }))).toThrow("Invalid saved dataset scope");
  });
});
