import { afterEach, describe, expect, it, vi } from "vitest";
import { Entity } from "@arkiv-network/sdk";
import { u64, key, bytes } from "@arkiv-network/sdk/schema";
import { stringToBytes, type Hex } from "viem";
import type { Dataset } from "./model";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@arkiv-network/sdk/query", () => ({ runQuery: query }));
import { coverageSummary, filteredQuery } from "./store";
const entityKey = ("0x" + "12".repeat(32)) as Hex;
const owner = ("0x" + "34".repeat(20)) as Hex;
const dataset: Dataset = { key: entityKey, owner, creator: owner, expiresAt: "100000", name: "Coverage unit fixture", description: "", chainId: 137, contract: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", writer: owner, startBlock: "10", endBlock: "12", enabled: true, continuous: false, createdAt: "2026-01-01T00:00:00Z" };
function setup(alert: boolean, count: number) {
  vi.stubEnv("AXIS_INDEXER_ADDRESS", owner); vi.stubEnv("ARKIV_ACCESS_KEY", "unit-fixture");
  const manifest = new Entity({ key: entityKey, owner, creator: owner, expiresAt: 100000n, attributes: { fromBlock: u64(10), toBlock: u64(12), rows: u64(3), contentHash: key(entityKey), document: bytes(stringToBytes(JSON.stringify({ blockHashes: {}, transactionHashes: [], verifiedAt: "2026-01-01T00:00:00Z" }))) } });
  query.mockImplementation(async (_client, request: { query: string }) => ({ entities: request.query.includes("axis.coverage_alert.v1") ? alert ? [new Entity({ key: entityKey })] : [] : request.query.includes("axis.coverage.v1") ? [manifest] : [], count: BigInt(count), blockNumber: 100n }));
}
afterEach(() => { query.mockReset(); vi.unstubAllEnvs(); });
describe("Verified coverage gates", () => {
  it("blocks totals when published records are missing or expired", async () => { setup(false, 2); const coverage = await coverageSummary(dataset); expect(coverage.complete).toBe(false); expect(coverage.gaps.join(" ")).toContain("expects 3 transfers but Arkiv has 2"); expect(() => filteredQuery(dataset, coverage, {})).toThrow(); });
  it("blocks previously verified coverage after a source consistency alert", async () => { setup(true, 3); const coverage = await coverageSummary(dataset); expect(coverage.complete).toBe(false); expect(() => filteredQuery(dataset, coverage, {})).toThrow("source consistency failure"); });
  it("allows a contiguous, complete and currently readable scope", async () => { setup(false, 3); const coverage = await coverageSummary(dataset); expect(coverage.complete).toBe(true); expect(coverage.expectedRows).toBe(3); expect(filteredQuery(dataset, coverage, {})).toContain("blockNumber <= u64(12)"); });
});
