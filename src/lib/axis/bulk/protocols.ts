import { decodeAbiParameters, decodeEventLog, encodeFunctionData, parseAbi, parseAbiItem, toEventSelector, type AbiEvent, type Hex } from "viem";
import { documentHash, quantity, rpcQuantity, type Json, type RpcLog, type StageRecord } from "./model";
import { RpcFailure, type RpcSource } from "./rpc";

export const DEPLOYMENTS = {
  quickswapV2: { factory: "0x5757371414417b8c6caad45baef941abc7d3ab32", source: "https://docs.quickswap.exchange/overview/contracts-and-addresses" },
  uniswapV3: { factory: "0x1f98431c8ad98523631ae4a59f267346ea31f984", source: "https://developers.uniswap.org/docs/protocols/v3/deployments/v3-polygon-deployments" },
  aaveV3: { pool: "0x794a61358d6845594f94dc1db02a252b5b4814ad", provider: "0xa97684ead0e402dc232d5a977953df7ecbab3cdb", source: "https://github.com/bgd-labs/aave-address-book/blob/main/src/AaveV3Polygon.sol" },
} as const;
export const PROTOCOL_TABLES = ["quickswap-pools", "quickswap-swaps", "quickswap-liquidity", "uniswap_v3-pools", "uniswap_v3-swaps", "uniswap_v3-liquidity", "aave-supplies", "aave-withdrawals", "aave-borrows", "aave-repayments", "aave-liquidations"] as const;
export type ProtocolTable = typeof PROTOCOL_TABLES[number];
export type ProtocolRecord = Omit<StageRecord, "tableId"> & { tableId: ProtocolTable };
type Family = "quickswap-v2" | "uniswap-v3";
export type ReadEvidence = { to: string; data: string; blockNumber: string; result: string };
export type PoolEvidence = { address: string; family: Family; factory: string; token0: string; token1: string; fee: string | null; observedAtBlock: string; calls: ReadEvidence[]; source: string };
export type RejectedPool = { address: string; family: Family; observedAtBlock: string; call: Omit<ReadEvidence, "result">; result: string | null; failure: string | null };
export type ProtocolEvidence = { pools: Record<string, PoolEvidence>; rejectedPools: Record<string, RejectedPool>; aaveBlocks: Record<string, ReadEvidence> };
export type EventDecoder = { tableId: ProtocolTable; family: Family | "aave-v3"; abi: AbiEvent; topic: string };
const event = (tableId: ProtocolTable, family: EventDecoder["family"], text: string): EventDecoder => { const abi = parseAbiItem(text) as AbiEvent; return { tableId, family, abi, topic: toEventSelector(abi).toLowerCase() }; };
export const PROTOCOL_EVENTS: EventDecoder[] = [
  event("quickswap-swaps", "quickswap-v2", "event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)"),
  event("quickswap-liquidity", "quickswap-v2", "event Mint(address indexed sender,uint256 amount0,uint256 amount1)"),
  event("quickswap-liquidity", "quickswap-v2", "event Burn(address indexed sender,uint256 amount0,uint256 amount1,address indexed to)"),
  event("uniswap_v3-swaps", "uniswap-v3", "event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)"),
  event("uniswap_v3-liquidity", "uniswap-v3", "event Mint(address sender,address indexed owner,int24 indexed tickLower,int24 indexed tickUpper,uint128 amount,uint256 amount0,uint256 amount1)"),
  event("uniswap_v3-liquidity", "uniswap-v3", "event Burn(address indexed owner,int24 indexed tickLower,int24 indexed tickUpper,uint128 amount,uint256 amount0,uint256 amount1)"),
  event("uniswap_v3-liquidity", "uniswap-v3", "event Collect(address indexed owner,address recipient,int24 indexed tickLower,int24 indexed tickUpper,uint128 amount0,uint128 amount1)"),
  event("aave-supplies", "aave-v3", "event Supply(address indexed reserve,address user,address indexed onBehalfOf,uint256 amount,uint16 indexed referralCode)"),
  event("aave-withdrawals", "aave-v3", "event Withdraw(address indexed reserve,address indexed user,address indexed to,uint256 amount)"),
  event("aave-borrows", "aave-v3", "event Borrow(address indexed reserve,address user,address indexed onBehalfOf,uint256 amount,uint8 interestRateMode,uint256 borrowRate,uint16 indexed referralCode)"),
  event("aave-repayments", "aave-v3", "event Repay(address indexed reserve,address indexed user,address indexed repayer,uint256 amount,bool useATokens)"),
  event("aave-liquidations", "aave-v3", "event LiquidationCall(address indexed collateralAsset,address indexed debtAsset,address indexed user,uint256 debtToCover,uint256 liquidatedCollateralAmount,address liquidator,bool receiveAToken)"),
];
const poolAbi = parseAbi(["function factory() view returns(address)", "function token0() view returns(address)", "function token1() view returns(address)", "function fee() view returns(uint24)"]);
const factoryAbi = parseAbi(["function getPair(address,address) view returns(address)", "function getPool(address,address,uint24) view returns(address)", "function getPool() view returns(address)"]);
const address = (result: string) => decodeAbiParameters([{ type: "address" }], result as Hex)[0].toLowerCase();
const factoryFor = (family: Family) => family === "quickswap-v2" ? DEPLOYMENTS.quickswapV2 : DEPLOYMENTS.uniswapV3;
const reverted = (error: unknown): error is RpcFailure => error instanceof RpcFailure && /execution reverted|revert(?:ed)?(?:\b|$)/i.test(error.message);
export const emptyProtocolEvidence = (): ProtocolEvidence => ({ pools: {}, rejectedPools: {}, aaveBlocks: {} });
function jsonArgs(value: unknown): Json {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return value.startsWith("0x") ? value.toLowerCase() : value;
  if (Array.isArray(value)) return value.map(jsonArgs);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, jsonArgs(item)]));
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  throw new Error("Unsupported decoded protocol value.");
}
function protocolRecord(raw: StageRecord, tableId: ProtocolTable, payload: Json, sourceId = raw.sourceId): ProtocolRecord {
  const body = { version: 1 as const, tableId, sourceId, blockNumber: raw.blockNumber, blockHash: raw.blockHash, timestamp: raw.timestamp, contract: raw.contract, txHash: raw.txHash, payload };
  return { ...body, contentHash: documentHash(body) };
}
export function validatePoolEvidence(pool: PoolEvidence) {
  const deployment = factoryFor(pool.family);
  if (!["quickswap-v2", "uniswap-v3"].includes(pool.family) || pool.factory !== deployment.factory || pool.source !== deployment.source || !/^0x[0-9a-f]{40}$/.test(pool.address) || pool.calls.length !== (pool.family === "uniswap-v3" ? 5 : 4)) throw new Error("Invalid pool membership evidence.");
  const expectedCalls = [
    { to: pool.address, data: encodeFunctionData({ abi: poolAbi, functionName: "factory" }), result: pool.factory },
    { to: pool.address, data: encodeFunctionData({ abi: poolAbi, functionName: "token0" }), result: pool.token0 },
    { to: pool.address, data: encodeFunctionData({ abi: poolAbi, functionName: "token1" }), result: pool.token1 },
  ];
  for (const [index, call] of expectedCalls.entries()) {
    const actual = pool.calls[index];
    if (actual.to !== call.to || actual.data !== call.data || actual.blockNumber !== pool.observedAtBlock || address(actual.result) !== call.result) throw new Error("Pool evidence call mismatch.");
  }
  if (pool.token0 === pool.token1 || pool.token0 === "0x" + "0".repeat(40) || pool.token1 === "0x" + "0".repeat(40)) throw new Error("Invalid pool token pair.");
  const membership = pool.calls.at(-1)!;
  let data: string;
  if (pool.family === "uniswap-v3") {
    const feeCall = pool.calls[3];
    if (feeCall.to !== pool.address || feeCall.data !== encodeFunctionData({ abi: poolAbi, functionName: "fee" }) || feeCall.blockNumber !== pool.observedAtBlock || decodeAbiParameters([{ type: "uint24" }], feeCall.result as Hex)[0].toString() !== pool.fee) throw new Error("Pool fee evidence mismatch.");
    data = encodeFunctionData({ abi: factoryAbi, functionName: "getPool", args: [pool.token0 as Hex, pool.token1 as Hex, Number(pool.fee)] });
  } else {
    if (pool.fee !== null) throw new Error("Unexpected V2 fee field.");
    data = encodeFunctionData({ abi: factoryAbi, functionName: "getPair", args: [pool.token0 as Hex, pool.token1 as Hex] });
  }
  if (membership.to !== pool.factory || membership.data !== data || membership.blockNumber !== pool.observedAtBlock || address(membership.result) !== pool.address) throw new Error("Official factory did not establish pool membership.");
}
export async function discoverProtocolEvidence(rows: StageRecord[], evidence: ProtocolEvidence, source: RpcSource) {
  const blockNumber = rows[0]?.blockNumber;
  if (blockNumber && !evidence.aaveBlocks[blockNumber]) {
    const to = DEPLOYMENTS.aaveV3.provider, data = encodeFunctionData({ abi: factoryAbi, functionName: "getPool", args: [] });
    const proof = { to, data, blockNumber, result: await source.read<string>("eth_call", [{ to, data }, rpcQuantity(blockNumber)]) };
    if (address(proof.result) !== DEPLOYMENTS.aaveV3.pool) throw new Error("Aave provider/pool mapping differs at the source block.");
    evidence.aaveBlocks[blockNumber] = proof;
  }
  for (const raw of rows) {
    if (raw.tableId !== "polygon-logs") continue;
    const log = raw.payload as unknown as RpcLog;
    const decoder = PROTOCOL_EVENTS.find(item => item.topic === log.topics[0]?.toLowerCase());
    if (!decoder) continue;
    const emitter = log.address.toLowerCase();
    const call = async (to: string, data: string): Promise<ReadEvidence> => ({ to, data, blockNumber: raw.blockNumber, result: await source.read<string>("eth_call", [{ to, data }, rpcQuantity(raw.blockNumber)]) });
    if (decoder.family === "aave-v3") {
      if (emitter !== DEPLOYMENTS.aaveV3.pool || evidence.aaveBlocks[raw.blockNumber]) continue;
      const proof = await call(DEPLOYMENTS.aaveV3.provider, encodeFunctionData({ abi: factoryAbi, functionName: "getPool", args: [] }));
      if (address(proof.result) !== DEPLOYMENTS.aaveV3.pool) throw new Error("Aave provider/pool mapping differs at the source block.");
      evidence.aaveBlocks[raw.blockNumber] = proof; continue;
    }
    if (evidence.pools[emitter] || evidence.rejectedPools[emitter]) continue;
    const deployment = factoryFor(decoder.family), calls: ReadEvidence[] = [];
    const factoryData = encodeFunctionData({ abi: poolAbi, functionName: "factory" });
    try { calls.push(await call(emitter, factoryData)); }
    catch (error) { if (!reverted(error)) throw error; evidence.rejectedPools[emitter] = { address: emitter, family: decoder.family, observedAtBlock: raw.blockNumber, call: { to: emitter, data: factoryData, blockNumber: raw.blockNumber }, result: null, failure: error.message }; continue; }
    let factory: string;
    try { factory = address(calls[0].result); }
    catch { evidence.rejectedPools[emitter] = { address: emitter, family: decoder.family, observedAtBlock: raw.blockNumber, call: { to: emitter, data: factoryData, blockNumber: raw.blockNumber }, result: calls[0].result, failure: "invalid-factory-response" }; continue; }
    if (factory !== deployment.factory) { evidence.rejectedPools[emitter] = { address: emitter, family: decoder.family, observedAtBlock: raw.blockNumber, call: { to: emitter, data: factoryData, blockNumber: raw.blockNumber }, result: calls[0].result, failure: null }; continue; }
    calls.push(await call(emitter, encodeFunctionData({ abi: poolAbi, functionName: "token0" })));
    calls.push(await call(emitter, encodeFunctionData({ abi: poolAbi, functionName: "token1" })));
    const token0 = address(calls[1].result), token1 = address(calls[2].result);
    let fee: string | null = null;
    if (decoder.family === "uniswap-v3") { calls.push(await call(emitter, encodeFunctionData({ abi: poolAbi, functionName: "fee" }))); fee = decodeAbiParameters([{ type: "uint24" }], calls.at(-1)!.result as Hex)[0].toString(); }
    const data = decoder.family === "uniswap-v3" ? encodeFunctionData({ abi: factoryAbi, functionName: "getPool", args: [token0 as Hex, token1 as Hex, Number(fee)] }) : encodeFunctionData({ abi: factoryAbi, functionName: "getPair", args: [token0 as Hex, token1 as Hex] });
    calls.push(await call(factory, data));
    const pool: PoolEvidence = { address: emitter, family: decoder.family, factory, token0, token1, fee, observedAtBlock: raw.blockNumber, calls, source: deployment.source };
    validatePoolEvidence(pool); evidence.pools[emitter] = pool;
  }
}
export function decodeProtocolRecords(rows: StageRecord[], evidence: ProtocolEvidence, seenPools = new Set<string>()): ProtocolRecord[] {
  const result: ProtocolRecord[] = [];
  const blockNumber = rows[0]?.blockNumber, aaveProof = blockNumber && evidence.aaveBlocks[blockNumber];
  if (blockNumber && (!aaveProof || aaveProof.to !== DEPLOYMENTS.aaveV3.provider || aaveProof.blockNumber !== blockNumber || aaveProof.data !== encodeFunctionData({ abi: factoryAbi, functionName: "getPool", args: [] }) || address(aaveProof.result) !== DEPLOYMENTS.aaveV3.pool)) throw new Error("Missing Aave source-block membership evidence.");
  for (const raw of rows) {
    if (raw.tableId !== "polygon-logs") continue;
    const log = raw.payload as unknown as RpcLog;
    const decoder = PROTOCOL_EVENTS.find(item => item.topic === log.topics[0]?.toLowerCase());
    if (!decoder) continue;
    const emitter = log.address.toLowerCase(), pool = evidence.pools[emitter];
    if (decoder.family === "aave-v3") {
      if (emitter !== DEPLOYMENTS.aaveV3.pool) continue;
      const proof = evidence.aaveBlocks[raw.blockNumber];
      if (!proof || proof.to !== DEPLOYMENTS.aaveV3.provider || proof.blockNumber !== raw.blockNumber || proof.data !== encodeFunctionData({ abi: factoryAbi, functionName: "getPool", args: [] }) || address(proof.result) !== emitter) throw new Error("Missing Aave source-block membership evidence.");
    } else {
      if (!pool) {
        const rejected = evidence.rejectedPools[emitter];
        if (!rejected) throw new Error("Pool classification is incomplete.");
        if (rejected.address !== emitter || rejected.call.to !== emitter || rejected.family !== decoder.family || rejected.call.data !== encodeFunctionData({ abi: poolAbi, functionName: "factory" }) || rejected.call.blockNumber !== rejected.observedAtBlock || BigInt(rejected.observedAtBlock) > BigInt(raw.blockNumber)) throw new Error("Invalid rejected-pool evidence.");
        if (rejected.result === null) { if (!/execution reverted|revert(?:ed)?(?:\b|$)/i.test(rejected.failure ?? "")) throw new Error("Unexplained pool classification failure."); }
        else if (rejected.failure === "invalid-factory-response") { let decoded: string | undefined; try { decoded = address(rejected.result); } catch {} if (decoded) throw new Error("Rejected factory response is actually valid."); }
        else if (rejected.failure !== null || address(rejected.result) === factoryFor(decoder.family).factory) throw new Error("Cannot reject a member of the selected official factory.");
        continue;
      }
      validatePoolEvidence(pool);
      if (pool.family !== decoder.family || BigInt(pool.observedAtBlock) > BigInt(raw.blockNumber)) throw new Error("Decoder family or pool evidence boundary mismatch.");
      if (!seenPools.has(emitter)) {
        result.push(protocolRecord(raw, pool.family === "quickswap-v2" ? "quickswap-pools" : "uniswap_v3-pools", { ...pool, scope: "pools observed emitting supported activity in the selected interval; not a global pool registry" } as unknown as Json, `137:${emitter}`));
        seenPools.add(emitter);
      }
    }
    const decoded = decodeEventLog({ abi: [decoder.abi], topics: log.topics as [Hex, ...Hex[]], data: log.data as Hex, strict: true });
    const payload: Json = { protocol: decoder.family, event: decoder.abi.name, abiVersion: `${decoder.family}.events.v1`, args: jsonArgs(decoded.args), logIndex: quantity(log.logIndex), ...(pool ? { token0: pool.token0, token1: pool.token1, factory: pool.factory, amounts: "raw per-token base units; no monetary aggregation" } : { pool: emitter, source: DEPLOYMENTS.aaveV3.source }) };
    result.push(protocolRecord(raw, decoder.tableId, payload));
  }
  return result;
}
