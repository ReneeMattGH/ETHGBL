import { describe, expect, it } from "vitest";
import { encodeEventTopics, encodeAbiParameters, type Log } from "viem";
import { TRANSFER_EVENT, aggregateTransfers, normalizeTransfer, sourceIdentity, validateBlockRange, validateFilters, validateDashboard } from "./core";
import { USDC, type Transfer } from "./model";
import { isNetworkId } from "../arkiv/networks";
import { transferOf } from "./store";
import { Entity } from "@arkiv-network/sdk";
import { addr } from "@arkiv-network/sdk/schema";
const sender = `0x${"11".repeat(20)}` as const, recipient = `0x${"22".repeat(20)}` as const;
function event(value = 1234567n): Log {
  return { address: USDC, topics: encodeEventTopics({ abi: [TRANSFER_EVENT], args: { from: sender, to: recipient } }) as Log["topics"], data: encodeAbiParameters([{ type: "uint256" }], [value]), blockNumber: 123n, blockHash: `0x${"aa".repeat(32)}`, transactionHash: `0x${"bb".repeat(32)}`, transactionIndex: 0, logIndex: 2, removed: false };
}
const transfer = (amount: string, override: Partial<Transfer> = {}) => ({ ...normalizeTransfer(event(BigInt(amount)), 1735776000n), ...override });
describe("Polygon normalization", () => {
  it("decodes the actual ERC20 event ABI and exact six-decimal units", () => { const row = normalizeTransfer(event(), 1000n); expect(row.sender).toBe(sender); expect(row.amount).toBe("1.234567"); expect(row.amountRaw).toBe("1234567"); expect(row.timestamp).toBe("1000"); });
  it("preserves values beyond JavaScript integer precision", () => { const row = normalizeTransfer(event(2n ** 255n), 1n); expect(row.amountRaw).toBe((2n ** 255n).toString()); });
  it("keeps logical identity stable and content hash sensitive to source changes", () => { const a = normalizeTransfer(event(1n), 10n), b = normalizeTransfer(event(2n), 10n); expect(a.sourceId).toBe(b.sourceId); expect(a.contentHash).not.toBe(b.contentHash); expect(sourceIdentity(137, a.txHash.toUpperCase(), 2)).toBe(a.sourceId); });
  it("rejects removed and unmined events", () => { expect(() => normalizeTransfer({ ...event(), removed: true }, 1n)).toThrow(); expect(() => normalizeTransfer({ ...event(), blockNumber: null }, 1n)).toThrow(); });
  it("rejects unrelated contracts and malformed ABI data", () => { expect(() => normalizeTransfer({ ...event(), address: sender }, 1n)).toThrow(); expect(() => normalizeTransfer({ ...event(), data: "0x01" }, 1n)).toThrow(); });
  it("normalizes checksummed Arkiv addresses before source readback comparison", () => { const entity = new Entity({ attributes: { contract: addr(USDC), sender: addr(sender), recipient: addr(recipient) } }); expect(transferOf(entity).contract).toBe(USDC); });
});
describe("Exact analytics", () => {
  it("sums large raw amounts exactly before formatting", () => { const huge = 900719925474099199n; const analytics = aggregateTransfers([transfer(huge.toString()), transfer("2")]); expect(analytics.amountRaw).toBe((huge + 2n).toString()); expect(analytics.amount).toBe("900719925474.099201"); });
  it("counts the wallet union once across repeated days and self-transfers", () => { const analytics = aggregateTransfers([transfer("1"), transfer("2", { timestamp: "1735862400", sender: recipient, recipient: recipient })]); expect(analytics.uniqueSenders).toBe(2); expect(analytics.uniqueRecipients).toBe(1); expect(analytics.uniqueWallets).toBe(2); expect(analytics.series).toHaveLength(2); });
  it("discloses mint, burn and zero-value events", () => { const zero = `0x${"0".repeat(40)}`; const result = aggregateTransfers([transfer("0", { sender: zero }), transfer("1", { recipient: zero })]); expect(result.mintCount).toBe(1); expect(result.burnCount).toBe(1); expect(result.zeroValueCount).toBe(1); });
  it("handles a genuine zero-result scope", () => { expect(aggregateTransfers([])).toMatchObject({ transfers: 0, amount: "0", uniqueWallets: 0, fromBlock: null }); });
  it("calculates exact median, nearest-rank P90 and rounded mean", () => { const result = aggregateTransfers(["0", "1", "1000000", "10000000", "100000000", "1000000000"].map(value => transfer(value))); expect(result.medianAmount).toBe("5.5"); expect(result.p90Amount).toBe("1000"); expect(result.averageAmount).toBe("185.166667"); expect(result.largestAmount).toBe("1000"); });
  it("preserves a half-base-unit median and explicitly rounds the mean", () => { const result = aggregateTransfers([transfer("0"), transfer("1")]); expect(result.medianAmount).toBe("0.0000005"); expect(result.averageAmount).toBe("0.000001"); });
  it("keeps transfer-size buckets exclusive and reconciles their totals", () => { const result = aggregateTransfers(["0", "1", "1000000", "10000000", "100000000", "1000000000"].map(value => transfer(value))); expect(result.distribution.map(bucket => bucket.transfers)).toEqual([1, 1, 1, 1, 1, 1]); expect(result.distribution.reduce((sum, bucket) => sum + BigInt(bucket.amountRaw), 0n).toString()).toBe(result.amountRaw); });
  it("groups by actual source block instead of inventing timeline points", () => { const result = aggregateTransfers([transfer("1", { blockNumber: "12" }), transfer("2", { blockNumber: "10" }), transfer("3", { blockNumber: "12" })]); expect(result.blockSeries.map(point => [point.blockNumber, point.transfers, point.amountRaw])).toEqual([["10", 1, "2"], ["12", 2, "4"]]); });
  it("reports empty quantiles as unavailable", () => { expect(aggregateTransfers([])).toMatchObject({ medianAmount: null, averageAmount: null, largestAmount: null, p90Amount: null }); });
});
describe("Boundaries and filter isolation", () => {
  it("uses inclusive block-range limits", () => { expect(validateBlockRange("10", "10", 1)).toEqual([10n, 10n]); expect(() => validateBlockRange("10", "11", 1)).toThrow(); expect(() => validateBlockRange("12", "11")).toThrow(); expect(() => validateBlockRange("1e3", "1001")).toThrow(); });
  it("validates indexed address and time filters", () => { expect(validateFilters({ sender })).toMatchObject({ sender }); expect(() => validateFilters({ recipient: "someone" })).toThrow(); expect(() => validateFilters({ fromTime: "20", toTime: "10" })).toThrow(); });
  it("drops legacy block limits while preserving wallet and time filters", () => { const legacy = { sender, fromTime: "10", toTime: "20", fromBlock: "12", toBlock: "13", lookbackBlocks: "30" }; expect(validateFilters(legacy)).toEqual({ sender, fromTime: "10", toTime: "20", order: "desc" }); expect(legacy.fromBlock).toBe("12"); });
  it("prevents a predicate escaping its dataset scope", () => { for (const predicate of [") OR enabled = true (", "amountRaw > u256(0) --", "x = str('unterminated)", "x = str('a') ORDER BY $key:key ASC"]) expect(() => validateFilters({ predicate })).toThrow(); expect(validateFilters({ predicate: "amountRaw > u256(0) OR sender = addr(" + sender + ")" }).predicate).toBeTruthy(); });
  it("rejects inherited network names", () => { expect(isNetworkId("rabdi")).toBe(true); expect(isNetworkId("toString")).toBe(false); expect(isNetworkId("__proto__")).toBe(false); });
  it("rejects malformed public dashboard definitions", () => { expect(() => validateDashboard({ version: 1, title: "test", description: "", widgets: [], refreshMs: 0 })).toThrow(); });
  it("validates published definitions without modifying their query documents", () => { const doc = { version: 1, title: "Test", description: "", refreshMs: 0, widgets: [{ id: "one", title: "Count", kind: "metric", metric: "transfers", grouping: "time", width: 1, query: { datasetKey: "0x" + "11".repeat(32), filters: {} } }] }; const original = JSON.stringify(doc); validateDashboard(doc); expect(JSON.stringify(doc)).toBe(original); });
});
