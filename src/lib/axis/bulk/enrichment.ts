import { decodeAbiParameters, decodeEventLog, encodeFunctionData, parseAbi, parseAbiItem, toEventSelector, toFunctionSelector, toEventSignature, toFunctionSignature, type Abi, type AbiEvent, type AbiFunction, type Hex } from "viem";
import { documentHash, quantity, rpcQuantity, type Json, type StageRecord, type RpcLog, type TokenMetadata } from "./model";
import { DEPLOYMENTS, PROTOCOL_EVENTS, type ProtocolEvidence } from "./protocols";
import type { BulkTableId, TableCoverage } from "./publication-model";

export type EnrichmentRecord = Omit<StageRecord, "tableId"> & { tableId: BulkTableId };
export type EnrichmentIO = { rpc<T>(method: string, params: unknown[]): Promise<T>; json(url: string): Promise<{ value: unknown; fetchedAt: string; sha256: string }> };
export const ENRICHMENT_POLICY = {
  version: 2, ratingLimit: 100,
  tokenList: "https://tokens.uniswap.org", tokenListLicense: "https://github.com/Uniswap/default-token-list/blob/main/LICENSE",
  chain: "https://raw.githubusercontent.com/ethereum-lists/chains/master/_data/chains/eip155-137.json",
  algebraFactory: "0x411b0facc3489691f28ad58c47006af5e3ab3a28",
  algebraSource: "https://docs.quickswap.exchange/overview/contracts-and-addresses",
  polymarketSource: "https://github.com/Polymarket/ctf-exchange-v2/blob/main/README.md",
  ctf: "0x4d97dcd97ec945f40cf65f87097ace5ea0476045",
  exchanges: {
    "0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e": "polymarket-v1",
    "0xe111180000d2663c0091e4f400237545b87b996b": "polymarket-v2",
    "0xe2222d279d744050d28e00520010520000310f59": "polymarket-v2-negative-risk",
  },
} as const;
const functions = parseAbi([
  "function factory() view returns(address)", "function token0() view returns(address)", "function token1() view returns(address)",
  "function poolByPair(address tokenA,address tokenB) view returns(address)",
  "function getPool() view returns(address)", "function getReservesList() view returns(address[])",
  "function getConfiguration(address asset) view returns(uint256)",
  "function getReserveNormalizedIncome(address asset) view returns(uint256)",
  "function getReserveNormalizedVariableDebt(address asset) view returns(uint256)",
]);
const erc20 = parseAbi(["function transfer(address to,uint256 amount) returns(bool)", "function approve(address spender,uint256 amount) returns(bool)", "function transferFrom(address from,address to,uint256 amount) returns(bool)", "function balanceOf(address owner) view returns(uint256)", "function decimals() view returns(uint8)", "function symbol() view returns(string)", "function name() view returns(string)", "event Transfer(address indexed from,address indexed to,uint256 value)", "event Approval(address indexed owner,address indexed spender,uint256 value)"]);
export const ENRICHMENT_EVENTS = [
  { tableId: "polymarket-trade_fills", family: "polymarket-v1", text: "event OrderFilled(bytes32 indexed orderHash,address indexed maker,address indexed taker,uint256 makerAssetId,uint256 takerAssetId,uint256 makerAmountFilled,uint256 takerAmountFilled,uint256 fee)" },
  { tableId: "polymarket-trade_fills", family: "polymarket-v2", text: "event OrderFilled(bytes32 indexed orderHash,address indexed maker,address indexed taker,uint8 side,uint256 tokenId,uint256 makerAmountFilled,uint256 takerAmountFilled,uint256 fee,bytes32 builder,bytes32 metadata)" },
  { tableId: "polymarket-redemptions", family: "ctf", text: "event PayoutRedemption(address indexed redeemer,address indexed collateralToken,bytes32 indexed parentCollectionId,bytes32 conditionId,uint256[] indexSets,uint256 payout)" },
  { tableId: "quickswap-swaps", family: "quickswap-algebra-v1", text: "event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 price,uint128 liquidity,int24 tick)" },
  { tableId: "quickswap-liquidity", family: "quickswap-algebra-v1", text: "event Mint(address sender,address indexed owner,int24 indexed bottomTick,int24 indexed topTick,uint128 liquidityAmount,uint256 amount0,uint256 amount1)" },
  { tableId: "quickswap-liquidity", family: "quickswap-algebra-v1", text: "event Burn(address indexed owner,int24 indexed bottomTick,int24 indexed topTick,uint128 liquidityAmount,uint256 amount0,uint256 amount1)" },
  { tableId: "quickswap-liquidity", family: "quickswap-algebra-v1", text: "event Collect(address indexed owner,address recipient,int24 indexed bottomTick,int24 indexed topTick,uint128 amount0,uint128 amount1)" },
].map(item => { const abi = parseAbiItem(item.text) as AbiEvent; return { ...item, tableId: item.tableId as BulkTableId, abi, topic: toEventSelector(abi).toLowerCase() }; });
export const enrichmentDecoderHash = () => documentHash({ policy: ENRICHMENT_POLICY, events: ENRICHMENT_EVENTS, functions, erc20 });
export function jsonValue(value: unknown): Json {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return /^0x[0-9a-f]+$/i.test(value) ? value.toLowerCase() : value;
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, jsonValue(v)]));
  throw new Error("Unsupported enrichment JSON value.");
}
export function enrichmentRecord(raw: StageRecord, tableId: BulkTableId, sourceId: string, payload: unknown, contract: string | null = raw.contract, txHash: string | null = raw.txHash): EnrichmentRecord {
  const value = jsonValue(payload), longIdentity = Buffer.byteLength(sourceId, "utf8") > 128;
  const body = { version: 1 as const, tableId, sourceId: longIdentity ? `137:${tableId}:${documentHash(sourceId)}` : sourceId, blockNumber: raw.blockNumber, blockHash: raw.blockHash, timestamp: raw.timestamp, contract, txHash, payload: longIdentity ? { ...(value && typeof value === "object" && !Array.isArray(value) ? value : { value }), sourceIdentity: sourceId } : value };
  return { ...body, contentHash: documentHash(body) };
}
const addr = (data: string) => decodeAbiParameters([{ type: "address" }], data as Hex)[0].toLowerCase();
const uint = (data: string) => decodeAbiParameters([{ type: "uint256" }], data as Hex)[0].toString();
const arrayOf = (value: unknown): unknown[] => { const result = typeof value === "string" ? JSON.parse(value) : value; if (!Array.isArray(result)) throw new Error("Expected an array in reference source."); return result; };

export async function referenceRecords(first: StageRecord, tokens: TokenMetadata[], io: EnrichmentIO): Promise<EnrichmentRecord[]> {
  const rows: EnrichmentRecord[] = [];
  const add = (table: BulkTableId, id: string, data: unknown, contract: string | null = null) => rows.push(enrichmentRecord(first, table, id, data, contract, null));
  const list = await io.json(ENRICHMENT_POLICY.tokenList), doc = list.value as { name: string; version: unknown; tokens: { chainId: number; address: string; symbol: string; decimals: number; name: string }[] };
  if (!Array.isArray(doc.tokens) || typeof doc.name !== "string") throw new Error("Invalid publisher token list.");
  const listed = doc.tokens.filter(t => t.chainId === 137).sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase()));
  const seen = new Set<string>();
  for (const token of listed) {
    const contract = token.address.toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(contract) || seen.has(contract) || !Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 255) throw new Error("Invalid or duplicate Polygon token-list item.");
    seen.add(contract); add("token-lists", `137:uniswap-list:${contract}`, { ...token, contract, publisher: doc.name, listVersion: doc.version, source: ENRICHMENT_POLICY.tokenList, sourceHash: list.sha256, license: "Publisher repository GPL-3.0; source attribution retained", licenseUrl: ENRICHMENT_POLICY.tokenListLicense, fetchedAt: list.fetchedAt, historicalValidity: "Current publisher snapshot; not historical onchain metadata" }, contract);
  }
  const chain = await io.json(ENRICHMENT_POLICY.chain), c = chain.value as { chainId: number; name: string; rpc: string[]; nativeCurrency: unknown };
  if (c.chainId !== 137 || !Array.isArray(c.rpc)) throw new Error("Chain registry identity mismatch.");
  add("chain-registry", "137:chain-reference", { chainId: 137, name: c.name, nativeCurrency: c.nativeCurrency, source: ENRICHMENT_POLICY.chain, sourceHash: chain.sha256, fetchedAt: chain.fetchedAt, license: "MIT", licenseUrl: "https://github.com/ethereum-lists/chains/blob/master/LICENSE" });
  for (const endpoint of [...new Set(c.rpc)].sort()) {
    // Never publish configured credentials, placeholders, query strings or authenticated endpoints.
    let url: URL; try { url = new URL(endpoint); } catch { continue; }
    if (url.protocol !== "https:" || url.username || url.password || url.search || /[${}]/.test(endpoint)) continue;
    add("rpc-registry", `137:public-rpc:${documentHash(endpoint)}`, { chainId: 137, url: endpoint, status: "listed; not probed", source: ENRICHMENT_POLICY.chain, sourceHash: chain.sha256, fetchedAt: chain.fetchedAt });
  }
  const deployments = [
    { contract: DEPLOYMENTS.quickswapV2.factory, protocol: "QuickSwap V2", role: "factory", source: DEPLOYMENTS.quickswapV2.source },
    { contract: ENRICHMENT_POLICY.algebraFactory, protocol: "QuickSwap V3 Algebra", role: "factory", source: ENRICHMENT_POLICY.algebraSource },
    { contract: DEPLOYMENTS.uniswapV3.factory, protocol: "Uniswap v3", role: "factory", source: DEPLOYMENTS.uniswapV3.source },
    { contract: DEPLOYMENTS.aaveV3.pool, protocol: "Aave v3", role: "pool", source: DEPLOYMENTS.aaveV3.source },
    { contract: DEPLOYMENTS.aaveV3.provider, protocol: "Aave v3", role: "addresses-provider", source: DEPLOYMENTS.aaveV3.source },
    ...Object.entries(ENRICHMENT_POLICY.exchanges).map(([contract, protocol]) => ({ contract, protocol, role: "exchange", source: protocol === "polymarket-v1" ? "https://github.com/Polymarket/ctf-exchange/blob/main/README.md" : ENRICHMENT_POLICY.polymarketSource })),
    { contract: ENRICHMENT_POLICY.ctf, protocol: "Polymarket", role: "conditional-tokens", source: "https://docs.polymarket.com/resources/contracts" },
  ];
  for (const d of deployments) {
    const code = await io.rpc<string>("eth_getCode", [d.contract, rpcQuantity(first.blockNumber)]);
    const data = { ...d, observedAtBlock: first.blockNumber, deployedAtSnapshot: code !== "0x", runtimeCodeHash: documentHash(code), validity: "Official deployment list; code presence at snapshot only; no deployment/upgrade history" };
    add("protocol-addresses", `137:protocol:${d.contract}`, data, d.contract);
    add("address-labels", `137:label:${d.contract}`, data, d.contract);
  }
  const abiGroups: { abi: Abi; source: string; contract: string | null; extra?: object }[] = [
    { abi: erc20, source: "https://eips.ethereum.org/EIPS/eip-20", contract: null },
    { abi: functions, source: "Official protocol interfaces; AXIS enrichment decoder v1", contract: null },
    { abi: PROTOCOL_EVENTS.map(e => e.abi), source: "AXIS protocol decoder v1; official protocol interfaces", contract: null },
    { abi: ENRICHMENT_EVENTS.map(e => e.abi), source: "AXIS enrichment decoder v1; official protocol interfaces", contract: null },
  ];
  for (const token of tokens) {
    const url = `https://sourcify.dev/server/v2/contract/137/${token.address}?fields=abi`;
    const source = await io.json(url), result = source.value as { abi?: Abi; address?: string; chainId?: string; runtimeMatch?: string; match?: string };
    if (!Array.isArray(result.abi)) {
      add("polygon-signatures", `137:abi:${token.address}`, { contract: token.address, abiHash: null, runtimeMatch: null, historicalValidity: "No Sourcify ABI available; proxy implementations not resolved", source: url, fetchedAt: source.fetchedAt }, token.address); continue;
    }
    if (result.address?.toLowerCase() !== token.address || String(result.chainId) !== "137") throw new Error("Sourcify contract identity mismatch.");
    const abiHash = documentHash(result.abi), extra = { abiHash, runtimeMatch: result.runtimeMatch ?? null, historicalValidity: "Current verified ABI reference only; proxy implementation and historical code/ABI validity not established", sourceHash: source.sha256, fetchedAt: source.fetchedAt };
    add("polygon-signatures", `137:abi:${token.address}`, { contract: token.address, ...extra, source: url }, token.address);
    abiGroups.push({ abi: result.abi, source: url, contract: token.address, extra });
  }
  const signatures = new Set<string>();
  for (const group of abiGroups) for (const item of group.abi) {
    if (item.type !== "event" && item.type !== "function") continue;
    const signature = item.type === "event" ? toEventSignature(item as AbiEvent) : toFunctionSignature(item as AbiFunction);
    const selector = item.type === "event" ? toEventSelector(item as AbiEvent) : toFunctionSelector(item as AbiFunction);
    const abiHash = documentHash(item), id = `${item.type}:${group.contract ?? "candidate"}:${abiHash}`;
    if (signatures.has(id)) continue; signatures.add(id);
    add(item.type === "event" ? "event-signatures" : "function-signatures", `137:${id}`, { signature, ...(item.type === "event" ? { topic: selector } : { selector }), abiHash, abi: item, source: group.source, contract: group.contract, candidateOnly: true, ...group.extra }, group.contract);
  }
  return rows;
}

export async function reserveRecords(first: StageRecord, io: EnrichmentIO): Promise<EnrichmentRecord[]> {
  const call = async (to: string, functionName: string, args: readonly Hex[] = []) => io.rpc<string>("eth_call", [{ to, data: encodeFunctionData({ abi: functions as Abi, functionName, args }) }, rpcQuantity(first.blockNumber)]);
  const pool = addr(await call(DEPLOYMENTS.aaveV3.provider, "getPool"));
  if (pool !== DEPLOYMENTS.aaveV3.pool) throw new Error("Aave provider changed at reserve snapshot.");
  const reserves = decodeAbiParameters([{ type: "address[]" }], await call(pool, "getReservesList") as Hex)[0].map(a => a.toLowerCase()).sort();
  if (reserves.length > 512 || new Set(reserves).size !== reserves.length) throw new Error("Invalid Aave reserve list.");
  const rows: EnrichmentRecord[] = [];
  for (const contract of reserves) rows.push(enrichmentRecord(first, "aave-reserves", `137:aave-reserve:${contract}:${first.blockNumber}`, { contract, pool, configuration: uint(await call(pool, "getConfiguration", [contract as Hex])), normalizedIncome: uint(await call(pool, "getReserveNormalizedIncome", [contract as Hex])), normalizedVariableDebt: uint(await call(pool, "getReserveNormalizedVariableDebt", [contract as Hex])), observedAtBlock: first.blockNumber, source: DEPLOYMENTS.aaveV3.source, units: "Configuration bitmap and RAY indexes (1e27); not balances or USD values" }, contract, null));
  return rows;
}

export async function decodeExtraProtocols(rows: StageRecord[], evidence: ProtocolEvidence, io: EnrichmentIO, seenPools: Set<string>): Promise<EnrichmentRecord[]> {
  const output: EnrichmentRecord[] = [];
  const pools = new Map<string, { token0: string; token1: string }>();
  for (const raw of rows) {
    if (raw.tableId !== "polygon-logs") continue;
    const log = raw.payload as unknown as RpcLog, emitter = log.address.toLowerCase();
    const decoder = ENRICHMENT_EVENTS.find(item => item.topic === log.topics[0]?.toLowerCase());
    if (!decoder) continue;
    let pool: { token0: string; token1: string } | undefined;
    if (decoder.family === "quickswap-algebra-v1") {
      // V1 Algebra shares the v3 event topics. The legacy decoder retained the rejecting factory result.
      const rejected = evidence.rejectedPools[emitter];
      if (!rejected?.result || !/^0x[0-9a-f]{64}$/i.test(rejected.result) || addr(rejected.result) !== ENRICHMENT_POLICY.algebraFactory) continue;
      pool = pools.get(emitter);
      if (!pool) {
        const call = async (to: string, functionName: string, args: Hex[] = []) => io.rpc<string>("eth_call", [{ to, data: encodeFunctionData({ abi: functions as Abi, functionName, args }) }, rpcQuantity(raw.blockNumber)]);
        if (addr(await call(emitter, "factory")) !== ENRICHMENT_POLICY.algebraFactory) throw new Error("Algebra factory changed at event block.");
        const token0 = addr(await call(emitter, "token0")), token1 = addr(await call(emitter, "token1"));
        if (token0 === token1 || BigInt(token0) === 0n || BigInt(token1) === 0n || addr(await call(ENRICHMENT_POLICY.algebraFactory, "poolByPair", [token0 as Hex, token1 as Hex])) !== emitter) throw new Error("Algebra official factory membership mismatch.");
        pool = { token0, token1 }; pools.set(emitter, pool);
        if (!seenPools.has(emitter)) { seenPools.add(emitter); output.push(enrichmentRecord(raw, "quickswap-pools", `137:algebra-pool:${emitter}`, { contract: emitter, family: decoder.family, protocol: "quickswap", factory: ENRICHMENT_POLICY.algebraFactory, ...pool, observedAtBlock: raw.blockNumber, source: ENRICHMENT_POLICY.algebraSource, coverage: "Observed active pools only" }, emitter, null)); }
      }
    } else if (decoder.family === "ctf") { if (emitter !== ENRICHMENT_POLICY.ctf) continue; }
    else {
      const family = ENRICHMENT_POLICY.exchanges[emitter as keyof typeof ENRICHMENT_POLICY.exchanges];
      if (!family || (family === "polymarket-v1") !== (decoder.family === "polymarket-v1")) continue;
    }
    const event = decodeEventLog({ abi: [decoder.abi], topics: log.topics as [Hex, ...Hex[]], data: log.data as Hex, strict: true });
    output.push(enrichmentRecord(raw, decoder.tableId, raw.sourceId, { event: event.eventName, protocol: decoder.family.startsWith("quickswap") ? "quickswap" : "polymarket", family: decoder.family, args: event.args, ...pool, collateral: decoder.family.startsWith("polymarket-v2") ? "pUSD wrapped collateral; base units" : "See exchange asset IDs; base units", fillCounting: "One OrderFilled log is one fill; maker/taker perspectives are not duplicated", source: decoder.family.startsWith("quickswap") ? ENRICHMENT_POLICY.algebraSource : ENRICHMENT_POLICY.polymarketSource }));
  }
  return output;
}

export async function marketRecords(first: StageRecord, records: EnrichmentRecord[], io: EnrichmentIO): Promise<EnrichmentRecord[]> {
  const tokenIds = new Set<string>(), seenMarkets = new Set<string>(), output: EnrichmentRecord[] = [];
  for (const row of records.filter(r => r.tableId === "polymarket-trade_fills")) {
    const p = row.payload as { args: Record<string, string> };
    for (const id of [p.args.tokenId, p.args.makerAssetId, p.args.takerAssetId]) if (id && id !== "0") tokenIds.add(id);
  }
  for (const tokenId of [...tokenIds].sort()) {
    const url = `https://gamma-api.polymarket.com/markets?clob_token_ids=${tokenId}&limit=100&offset=0`;
    const fetched = await io.json(url), markets = arrayOf(fetched.value) as Record<string, unknown>[];
    if (markets.length >= 100) throw new Error("Market token lookup exceeded its bounded result; pagination required.");
    for (const market of markets) {
      const ids = arrayOf(market.clobTokenIds ?? "[]").map(String);
      if (!ids.includes(tokenId)) throw new Error("Market API ignored the requested token filter.");
      const conditionId = String(market.conditionId).toLowerCase();
      if (!/^0x[0-9a-f]{64}$/.test(conditionId)) throw new Error("Invalid market condition identity.");
      if (seenMarkets.has(conditionId)) continue; seenMarkets.add(conditionId);
      const outcomes = arrayOf(market.outcomes ?? "[]").map(String);
      if (outcomes.length !== ids.length || new Set(ids).size !== ids.length) throw new Error("Market outcome/token mapping mismatch.");
      const provenance = { source: url, sourceHash: fetched.sha256, fetchedAt: fetched.fetchedAt, historicalValidity: "Current API metadata for observed traded tokens; not historical state or onchain verification" };
      output.push(enrichmentRecord(first, "polymarket-markets", `137:market:${conditionId}`, { conditionId, question: market.question ?? "", slug: market.slug ?? "", closed: market.closed ?? null, ...provenance }, null, null));
      ids.forEach((id, index) => output.push(enrichmentRecord(first, "polymarket-outcome_tokens", `137:outcome:${conditionId}:${id}`, { tokenId: id, conditionId, outcome: outcomes[index], tokenStandard: "ERC-1155", ...provenance }, ENRICHMENT_POLICY.ctf, null)));
    }
  }
  return output;
}

export function ratingRecords(first: StageRecord, transactions: StageRecord[], toBlock: string): EnrichmentRecord[] {
  const accounts = new Map<string, { transactions: number; blocks: Set<string> }>();
  for (const raw of transactions) {
    const tx = (raw.payload as { transaction: { from: string } }).transaction, address = tx.from.toLowerCase();
    const value = accounts.get(address) ?? { transactions: 0, blocks: new Set<string>() };
    value.transactions++; value.blocks.add(raw.blockNumber); accounts.set(address, value);
  }
  const model = "observed-sender-activity-v1", formula = "min(100, 2 * transactions + 5 * activeBlocks)";
  const scope = { fromBlock: first.blockNumber, toBlock, model, coverage: "Successful and failed transaction senders in this finalized interval; contracts/relayed users not resolved; activity only, no trust/credit claim" };
  const output = [enrichmentRecord(first, "rating-models", `137:rating-model:${model}`, { ...scope, formula, selection: `Top ${ENRICHMENT_POLICY.ratingLimit} senders by transaction count, then lowercase address; no value or token aggregation`, totalObservedSenders: accounts.size }, null, null)];
  for (const [contract, activity] of [...accounts].sort(([a, av], [b, bv]) => bv.transactions - av.transactions || a.localeCompare(b)).slice(0, ENRICHMENT_POLICY.ratingLimit)) output.push(enrichmentRecord(first, "wallet-ratings", `137:rating:${model}:${contract}`, { ...scope, contract, transactions: activity.transactions, activeBlocks: activity.blocks.size, score: Math.min(100, activity.transactions * 2 + activity.blocks.size * 5) }, contract, null));
  return output;
}

type CallFrame = { type: string; from?: string; to?: string; input?: string; output?: string; value?: string; error?: string; calls?: CallFrame[] };
export function traceRecords(raw: StageRecord, root: CallFrame): EnrichmentRecord[] {
  if (!root || typeof root.type !== "string") throw new Error("Invalid callTracer root.");
  const output: EnrichmentRecord[] = [];
  const walk = (frame: CallFrame, path: string, inheritedRevert: boolean, depth: number) => {
    if (depth > 128 || output.length > 100_000 || !frame || typeof frame.type !== "string" || frame.calls !== undefined && !Array.isArray(frame.calls)) throw new Error("Invalid or excessive callTracer tree.");
    const data = { path, type: frame.type, from: frame.from?.toLowerCase() ?? null, to: frame.to?.toLowerCase() ?? null, value: frame.value ? quantity(frame.value) : "0", input: frame.input ?? "0x", output: frame.output ?? "0x", error: frame.error ?? null, reverted: inheritedRevert || Boolean(frame.error) };
    const id = `137:trace:${raw.txHash}:${path}`;
    output.push(enrichmentRecord(raw, "polygon-traces", id, data, data.to));
    if (["CREATE", "CREATE2"].includes(frame.type.toUpperCase())) output.push(enrichmentRecord(raw, "polygon-creation-traces", id, data, data.to));
    if (["CALL", "CALLCODE", "DELEGATECALL", "STATICCALL"].includes(frame.type.toUpperCase()) && /^0x[0-9a-f]{8}/i.test(data.input)) output.push(enrichmentRecord(raw, "polygon-decoded-traces", id, { ...data, selector: data.input.slice(0, 10), candidates: [], decoderStatus: "No block-valid implementation ABI established; raw call retained" }, data.to));
    frame.calls?.forEach((child, index) => walk(child, `${path}.${index}`, data.reverted, depth + 1));
  };
  walk(root, "0", false, 0); return output;
}
export function enrichmentCoverage(traces: boolean, traceError: string | null): Partial<Record<BulkTableId, TableCoverage>> {
  const tables: BulkTableId[] = ["token-lists", "chain-registry", "rpc-registry", "address-labels", "protocol-addresses", "function-signatures", "event-signatures", "polygon-signatures", "wallet-ratings", "rating-models", "aave-reserves", "polymarket-markets", "polymarket-outcome_tokens", "polymarket-trade_fills", "polymarket-redemptions", "prediction-trades"];
  const result: Partial<Record<BulkTableId, TableCoverage>> = Object.fromEntries(tables.map(t => [t, { state: "available", detail: "Scoped enrichment v1; current attributed references, start-block reserves, top-100 observed-sender activity, allowlisted Polymarket v1/v2 fills/CTF redemptions. Metadata only for observed traded token IDs. Newer exchanges and global discovery excluded." }]));
  for (const t of ["polygon-traces", "polygon-creation-traces", "polygon-decoded-traces"] as const) result[t] = { state: traces && !traceError ? "available" : "unavailable", detail: traceError ?? "Trace acquisition was not requested; provider capability required." };
  return result;
}
