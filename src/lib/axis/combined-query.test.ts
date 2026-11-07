import { beforeEach, describe, expect, it, vi } from "vitest";
import { stringToHex } from "viem";
import type { Entity } from "@arkiv-network/sdk";
import { USDC, type Dataset } from "./model";

const { runQuery } = vi.hoisted(() => ({ runQuery: vi.fn() }));
vi.mock("@arkiv-network/sdk/query", () => ({ runQuery }));
vi.mock("./runtime", () => ({ writerAddress: () => `0x${"a".repeat(40)}`, arkivReader: () => ({}), retryRead: (operation: () => unknown) => operation() }));
vi.mock("./queue", () => ({ readState: async () => null }));
import { coverageSummary, datasetOf, executeCombinedQuery, executeQuery, filteredQuery, scanEntities } from "./store";

const keyA = `0x${"1".repeat(64)}`, keyB = `0x${"2".repeat(64)}`, owner = `0x${"a".repeat(40)}`;
const datasets: Dataset[] = [keyA, keyB].map((key, index) => ({ key, owner, creator: owner, expiresAt: "99999999", name: "Dataset " + (index + 1), description: "", writer: owner, chainId: 137, contract: USDC, startBlock: index ? "30" : "10", endBlock: "0", enabled: true, continuous: true, createdAt: "2026-11-07T00:00:00Z" }));
function entity(key: string, values: Record<string, unknown>, doc: unknown = {}): Entity {
  return { key, owner, creator: owner, expiresAt: 99999999n, attributes: { ...Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { value }])), document: { type: "bytes", value: stringToHex(JSON.stringify(doc)) } } } as unknown as Entity;
}
const transfer = (datasetKey: string, index: number) => entity(`0x${String(index + 3).repeat(64).slice(0, 64)}`, { datasetKey, sourceId: "transfer-" + index, chainId: 137, contract: USDC, blockNumber: datasetKey === keyB ? index + 30 : index + 10, blockHash: keyA, sourceTime: "1794000000", txHash: keyA, logIndex: index, sender: owner, recipient: owner, amountRaw: "1000000", amount: "1", decimals: 6, contentHash: keyA });
const rows = [transfer(keyA, 0), transfer(keyA, 1), transfer(keyB, 2)];
const queries = [{ datasetKey: keyA, filters: { sender: owner } }, { datasetKey: keyB, filters: { recipient: owner } }];
let failSource = false;
beforeEach(() => {
  runQuery.mockReset(); failSource = false;
  runQuery.mockImplementation(async (_client, input: { query: string; limit: number; offset: number }) => {
    const { query, limit, offset } = input;
    if (query.includes("axis.dataset.v1")) {
      const dataset = datasets.find(dataset => query.includes("$key = key(" + dataset.key + ")"));
      return { entities: dataset ? [entity(dataset.key, { ...dataset, sourceTime: "1794000000" }, { description: dataset.description, resultSource: dataset.resultSource })] : [], count: dataset ? 1n : 0n, blockNumber: 1n };
    }
    if (query.includes("axis.coverage.v1")) {
      const isB = query.includes(keyB);
      return { entities: [entity(isB ? keyB : keyA, { fromBlock: isB ? "30" : "10", toBlock: isB ? "40" : "20", rows: "2", contentHash: keyA }, { blockHashes: {}, transactionHashes: [], verifiedAt: "2026-11-07T00:00:00Z" })], count: 1n, blockNumber: 1n };
    }
    if (query.includes("axis.transfer.v1")) {
      if (query.includes(" OR ")) return { entities: rows.slice(offset, offset + limit), count: 3n, blockNumber: 1n };
      return { entities: [], count: failSource && query.includes(keyB) ? 1n : 2n, blockNumber: 1n };
    }
    return { entities: [], count: 0n, blockNumber: 1n };
  });
});

describe("Native Arkiv combined queries", () => {
  it("keeps filters and verified ranges inside each OR branch and paginates the union", async () => {
    const result = await executeCombinedQuery(queries, "page", 1, 2, "asc");
    expect(result.executedQuery).toContain(`datasetKey = key(${keyA}) AND blockNumber >= u64(10) AND blockNumber <= u64(20) AND sender = addr(${owner})) OR (`);
    expect(result.executedQuery).toContain(`datasetKey = key(${keyB}) AND blockNumber >= u64(30) AND blockNumber <= u64(40) AND recipient = addr(${owner})) ORDER BY blockNumber:u64 ASC`);
    expect(result.total).toBe("3");
    expect(result.entities).toHaveLength(2);
    expect(result.entities?.[1].datasetKey).toBe(keyB);
    expect(result.sources?.map(source => source.datasetKey)).toEqual([keyA, keyB]);
    expect(runQuery).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ query: result.executedQuery, offset: 1, limit: 2 }));
  });
  it("calculates analytics and exports from the whole native union", async () => {
    const result = await executeCombinedQuery(queries, "export");
    expect(result.entities).toHaveLength(3);
    expect(result.analytics).toMatchObject({ transfers: 3, amount: "3" });
    expect(result.recordDatasets).toEqual([{ key: keyA, name: "Dataset 1" }, { key: keyB, name: "Dataset 2" }]);
  });
  it("rejects duplicates and source coverage failures instead of returning partial results", async () => {
    await expect(executeCombinedQuery([queries[0], queries[0]], "page")).rejects.toThrow("only be selected once");
    expect(runQuery).not.toHaveBeenCalled();
    failSource = true;
    await expect(executeCombinedQuery(queries, "page")).rejects.toThrow("Coverage expects");
    expect(runQuery.mock.calls.some(([, input]) => input.query.includes(" OR "))).toBe(false);
  });
  it("applies the export cursor to the entire OR expression", async () => {
    const predicate = "sender = addr(" + owner + ") OR recipient = addr(" + owner + ")";
    const first = Array.from({ length: 100 }, (_, index) => ({ key: "0x" + index.toString(16).padStart(64, "0") }));
    runQuery.mockReset();
    runQuery.mockResolvedValueOnce({ entities: first }).mockResolvedValueOnce({ entities: [{ key: keyB }] });
    expect(await scanEntities(predicate)).toHaveLength(101);
    expect(runQuery.mock.calls[1][1].query).toBe("(" + predicate + ") AND $key > key(" + first[99].key + ") ORDER BY $key:key ASC");
  });
  it("reopens combined saved datasets with every frozen scope and verifies their union count", async () => {
    const saved: Dataset = { ...datasets[0], key: `0x${"8".repeat(64)}`, endBlock: "40", continuous: false, resultSource: { datasetKey: keyA, filters: [], rows: 3, scopes: [
      { datasetKey: keyA, fromBlock: "10", throughBlock: "20", filters: [{ sender: owner }] },
      { datasetKey: keyB, fromBlock: "30", throughBlock: "40", filters: [{ recipient: owner }] },
    ] } };
    const decoded = datasetOf(entity(saved.key, { ...saved, sourceTime: "1794000000" }, { resultSource: saved.resultSource }));
    expect(decoded.resultSource?.scopes).toHaveLength(2);
    const coverage = await coverageSummary(decoded);
    expect(coverage).toMatchObject({ complete: true, actualRows: 3, expectedRows: 3 });
    const predicate = filteredQuery(decoded, coverage, { fromTime: "100" });
    expect(predicate.match(/sourceTime >= u64\(100\)/g)).toHaveLength(2);
    expect(predicate).toContain(`datasetKey = key(${keyB})`);
    datasets.push(saved);
    try {
      const reopened = await executeQuery(saved.key, {}, "page");
      expect(reopened.entities).toHaveLength(3);
      expect(reopened.recordDatasets).toEqual([{ key: keyA, name: "Dataset 1" }, { key: keyB, name: "Dataset 2" }]);
    } finally { datasets.pop(); }
  });
});
