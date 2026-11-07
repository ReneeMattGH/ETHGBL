import { describe, expect, it } from "vitest";
import { scanKeyRanges } from "./key-scan";

const END = 1n << 256n;
const key = (value: bigint) => "0x" + value.toString(16).padStart(64, "0");
const records = (count: number) => Array.from({ length: count }, (_, index) => ({ key: key(END * BigInt(index + 1) / BigInt(count + 1)), amountRaw: "123456789012345678901234567890" }));
function fixture(rows = records(1001)) {
  const queries: string[] = [];
  let active = 0, peak = 0;
  const read = async (query: string) => {
    queries.push(query); active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    const lower = /\$key > key\((0x[0-9a-f]+)\)/i.exec(query)?.[1];
    const upper = /\$key < key\((0x[0-9a-f]+)\)/i.exec(query)?.[1];
    const entities = rows.filter(row => (!lower || BigInt(row.key) > BigInt(lower)) && (!upper || BigInt(row.key) < BigInt(upper)));
    active--; return { entities: entities.slice(0, 100) };
  };
  return { read, queries, peak: () => peak };
}

describe("parallel key-range scans", () => {
  it("returns exactly the sequential rows in key order without overlapping ranges", async () => {
    const rows = records(1001), parallel = fixture(rows), sequential = fixture(rows);
    const result = await scanKeyRanges("trusted-scope", parallel.read, 2000, 4);
    expect(result).toEqual(await scanKeyRanges("trusted-scope", sequential.read, 2000));
    expect(result).toEqual(rows);
    expect(new Set(result.map(row => row.key)).size).toBe(rows.length);
    expect(parallel.peak()).toBe(4);
    expect(sequential.peak()).toBe(1);
  });
  it("does not shard small responses or change exact base-unit values", async () => {
    const rows = records(15), source = fixture(rows);
    expect(await scanKeyRanges("trusted-scope", source.read, 100, 4)).toEqual(rows);
    expect(source.queries).toHaveLength(1);
  });
  it("parenthesizes the entire OR source predicate inside every cursor/range", async () => {
    const source = fixture(records(240));
    const predicate = "source-a AND sender-a OR source-b AND recipient-b";
    await scanKeyRanges(predicate, source.read, 1000, 4);
    expect(source.queries.slice(1).every(query => query.startsWith(`(${predicate}) AND $key > key(`))).toBe(true);
  });
  it("rejects caps and shard failures instead of returning incomplete analytics", async () => {
    await expect(scanKeyRanges("scope", fixture().read, 150, 4)).rejects.toThrow("no partial total");
    const source = fixture();
    await expect(scanKeyRanges("scope", async query => {
      if (query.includes("$key <")) throw new Error("shard unavailable");
      return source.read(query);
    }, 2000, 4)).rejects.toThrow("shard unavailable");
  });
  it("rejects repeated, out-of-range and unsorted keys", async () => {
    const first = records(100);
    let call = 0;
    await expect(scanKeyRanges("scope", async () => ({ entities: call++ === 0 ? first : [first[0]] }), 2000, 4)).rejects.toThrow("out-of-range");
    await expect(scanKeyRanges("scope", async () => ({ entities: [...first].reverse() }), 2000, 4)).rejects.toThrow("strictly ordered");
    await expect(scanKeyRanges("scope", async () => ({ entities: first }), 2000)).rejects.toThrow("did not advance");
  });
});
