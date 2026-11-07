import { afterEach, describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, type AbiParameter, type Hex } from "viem";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blockRecords } from "./source";
import { DEPLOYMENTS, PROTOCOL_EVENTS, decodeProtocolRecords, discoverProtocolEvidence, emptyProtocolEvidence, type EventDecoder } from "./protocols";
import { config, fixture, fixtureSource, recipient, sender, tokenA, tokenB } from "./fixtures.test-helper";
import { extractStage } from "./staging";
import { decodeStageProtocols, verifyProtocolStage } from "./protocol-stage";
import { exportProtocolParquet } from "./parquet";
import { RpcFailure, type RpcSource } from "./rpc";
import type { RpcLog } from "./model";

const poolV2 = "0x" + "55".repeat(20), poolV3 = "0x" + "66".repeat(20), foreign = "0x" + "77".repeat(20);
const addrResult = (value: string) => encodeAbiParameters([{ type: "address" }], [value as Hex]);
function logFor(decoder: EventDecoder, number = 10, index = 2): RpcLog {
  const { block, receipt } = fixture(number);
  const indexed: Record<string, unknown> = {}, dataTypes: AbiParameter[] = [], dataValues: unknown[] = [];
  for (const input of decoder.abi.inputs) {
    let value: unknown;
    if (input.type === "address") value = input.name === "reserve" ? tokenA : input.name === "sender" || input.name === "user" ? sender : recipient;
    else if (input.type === "bool") value = true;
    else value = input.name === "amount1" || input.name === "tick" || input.name === "tickLower" ? -3n : input.name === "sqrtPriceX96" ? 2n ** 96n : 7n;
    if (input.type.startsWith("uint") && typeof value === "bigint" && value < 0) value = 3n;
    // Small integer ABI encoders accept bigint too; the decoder may return a number for these widths.
    if (input.indexed) indexed[input.name!] = value;
    else { dataTypes.push(input); dataValues.push(value); }
  }
  return { address: decoder.family === "quickswap-v2" ? poolV2 : decoder.family === "uniswap-v3" ? poolV3 : DEPLOYMENTS.aaveV3.pool, blockHash: block.hash, blockNumber: block.number, transactionHash: receipt.transactionHash, transactionIndex: "0x0", logIndex: `0x${index.toString(16)}`, removed: false, topics: [...encodeEventTopics({ abi: [decoder.abi], eventName: decoder.abi.name, args: indexed })] as string[], data: encodeAbiParameters(dataTypes, dataValues) };
}
function allLogs(number = 10) { return PROTOCOL_EVENTS.map((decoder, index) => logFor(decoder, number, index + 2)); }
function protocolSource(options: { failAtBlock?: string; wrongMembership?: boolean; providerPool?: string; transientPoolFailure?: boolean } = {}) {
  const base = fixtureSource(), calls: { method: string; params: unknown[] }[] = [];
  const source: RpcSource = { host: "protocol-fixture.invalid", calls: () => calls.length, read: async <T>(method: string, params: unknown[]): Promise<T> => {
    calls.push({ method, params });
    if (method === "eth_getBlockReceipts") { const number = Number(BigInt(String(params[0]))); const { receipt } = fixture(number); return [{ ...receipt, logs: [...receipt.logs, ...allLogs(number)] }] as T; }
    if (method !== "eth_call") return base.source.read<T>(method, params);
    const call = params[0] as { to: string; data: string };
    if ([tokenA, tokenB].includes(call.to)) return base.source.read<T>(method, params);
    if (options.failAtBlock === params[1]) throw new RpcFailure("Injected RPC interruption");
    if (call.to === DEPLOYMENTS.aaveV3.provider) return addrResult(options.providerPool ?? DEPLOYMENTS.aaveV3.pool) as T;
    if (options.transientPoolFailure && [poolV2, poolV3].includes(call.to)) throw new RpcFailure("Rate limit exceeded", -32005);
    if (call.to === DEPLOYMENTS.quickswapV2.factory) return addrResult(options.wrongMembership ? foreign : poolV2) as T;
    if (call.to === DEPLOYMENTS.uniswapV3.factory) return addrResult(options.wrongMembership ? foreign : poolV3) as T;
    if (call.to === foreign) return addrResult(foreign) as T;
    if (call.data === "0xc45a0155") return addrResult(call.to === poolV2 ? DEPLOYMENTS.quickswapV2.factory : DEPLOYMENTS.uniswapV3.factory) as T;
    if (call.data === "0x0dfe1681") return addrResult(tokenA) as T;
    if (call.data === "0xd21220a7") return addrResult(tokenB) as T;
    if (call.data === "0xddca3f43") return encodeAbiParameters([{ type: "uint24" }], [3000]) as T;
    throw new Error("Unexpected protocol fixture call");
  } };
  return { source, calls };
}
function rowsFor(logs = allLogs()) { const { block, receipt } = fixture(10); return blockRecords(block, [{ ...receipt, logs: [...receipt.logs, ...logs] }], [], false); }
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { force: true, recursive: true }))); });

describe("Protocol decoder identity and units", () => {
  it("decodes every implemented event layout with factory membership, signed amounts and distinct Aave action types", async () => {
    const rows = rowsFor(), evidence = emptyProtocolEvidence(); await discoverProtocolEvidence(rows, evidence, protocolSource().source);
    const decoded = decodeProtocolRecords(rows, evidence);
    expect(decoded).toHaveLength(PROTOCOL_EVENTS.length + 2);
    expect(decoded.filter(row => row.tableId === "uniswap_v3-swaps")[0].payload).toMatchObject({ args: { amount1: "-3", tick: -3 }, token0: tokenA, token1: tokenB });
    for (const table of ["aave-supplies", "aave-withdrawals", "aave-borrows", "aave-repayments", "aave-liquidations"]) expect(decoded.filter(row => row.tableId === table)).toHaveLength(1);
    expect(decoded.filter(row => row.tableId.endsWith("liquidity"))).toHaveLength(5);
  });
  it("rejects spoofed official-factory claims and does not turn transient classification failures into empty data", async () => {
    await expect(discoverProtocolEvidence(rowsFor(), emptyProtocolEvidence(), protocolSource({ wrongMembership: true }).source)).rejects.toThrow("membership");
    const evidence = emptyProtocolEvidence();
    await expect(discoverProtocolEvidence(rowsFor(), evidence, protocolSource({ transientPoolFailure: true }).source)).rejects.toThrow("Rate limit");
    expect(Object.keys(evidence.rejectedPools)).toHaveLength(0);
    await expect(discoverProtocolEvidence(rowsFor(), emptyProtocolEvidence(), protocolSource({ providerPool: foreign }).source)).rejects.toThrow("provider/pool");
  });
  it("retains evidence for unrelated protocol lookalikes and refuses forged rejection of a selected pool", async () => {
    const decoder = PROTOCOL_EVENTS[0], rows = rowsFor([{ ...logFor(decoder), address: foreign }]), evidence = emptyProtocolEvidence();
    await discoverProtocolEvidence(rows, evidence, protocolSource().source);
    expect(decodeProtocolRecords(rows, evidence)).toEqual([]);
    const rejected = evidence.rejectedPools[foreign]; rejected.result = addrResult(DEPLOYMENTS.quickswapV2.factory);
    expect(() => decodeProtocolRecords(rows, evidence)).toThrow("Cannot reject");
  });
  it("fails a malformed known event and refuses missing evidence instead of silently skipping it", async () => {
    const rows = rowsFor(), evidence = emptyProtocolEvidence(); await discoverProtocolEvidence(rows, evidence, protocolSource().source);
    const target = rows.find(row => row.tableId === "polygon-logs" && (row.payload as unknown as RpcLog).address === poolV2)!;
    (target.payload as unknown as RpcLog).data = "0x";
    expect(() => decodeProtocolRecords(rows, evidence)).toThrow();
    delete evidence.aaveBlocks["10"]; expect(() => decodeProtocolRecords(rowsFor(), evidence)).toThrow("membership evidence");
  });
});

describe("Protocol staging and Parquet", () => {
  it("resumes a failed enrichment without refetching raw blocks, verifies derivation and detects corruption", async () => {
    const directory = await mkdtemp(join(tmpdir(), "axis-protocol-test-")); directories.push(directory);
    await extractStage(directory, config, protocolSource().source);
    await expect(decodeStageProtocols(directory, protocolSource({ failAtBlock: "0xb" }).source)).rejects.toThrow("interruption");
    await expect(verifyProtocolStage(directory)).rejects.toThrow("incomplete");
    const { source, calls } = protocolSource(), result = await decodeStageProtocols(directory, source);
    expect(result.counts["quickswap-pools"]).toBe(1); expect(result.counts["uniswap_v3-pools"]).toBe(1);
    expect(result.counts["aave-supplies"]).toBe(2); expect(result.views["dex-trades"]).toBe(4);
    expect(calls.some(call => call.method === "eth_getBlockReceipts")).toBe(false);
    const offline = protocolSource(); await decodeStageProtocols(directory, offline.source); expect(offline.calls).toHaveLength(0);
    const exported = await exportProtocolParquet(directory); expect(exported.tables.find(table => table.tableId === "aave-supplies")?.rows).toBe(2);
    const verified = await verifyProtocolStage(directory), part = verified.manifest.parts[0];
    const path = join(directory, "protocols", "parts", part.file); await writeFile(path, (await readFile(path, "utf8")) + " ");
    await expect(verifyProtocolStage(directory)).rejects.toThrow("size");
  }, 30_000);
  it("exports genuinely empty protocol intervals as zero-row tables with checked Aave deployment mapping", async () => {
    const directory = await mkdtemp(join(tmpdir(), "axis-empty-protocol-test-")); directories.push(directory);
    await extractStage(directory, config, fixtureSource().source);
    const result = await decodeStageProtocols(directory, protocolSource().source);
    expect(Object.values(result.counts).every(value => value === 0)).toBe(true);
    const exported = await exportProtocolParquet(directory); expect(exported.tables.every(table => table.rows === 0)).toBe(true);
  }, 30_000);
});
