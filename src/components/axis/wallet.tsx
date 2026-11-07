"use client";
import * as React from "react";
import { afterAxisWrite, invalidateAxisReads } from "@/lib/axis/read-cache";
import { createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { addr, key, u64 } from "@arkiv-network/sdk/schema";
import { custom, stringToBytes, type Address, type Hex } from "viem";
import { DatasetSchema, DashboardSchema, SavedQuerySchema } from "@/lib/axis/schemas";
import { USDC, type Dataset, type Filters, type DashboardDocument, type QueryDefinition, type PlatformConfig } from "@/lib/axis/model";
import { validateDashboard, validateFilters } from "@/lib/axis/core";
import { jobMessage } from "@/lib/axis/auth";
import { datasetScopes, validateResultScopes } from "@/lib/axis/query-scope";
import { SnapshotSchema } from "@/lib/axis/swarm-schema";
import { snapshotMessage, validateSnapshotDocument, type SnapshotAuthorization, type SnapshotDocument, type SnapshotIntent, type SnapshotPublicationCheck } from "@/lib/axis/swarm-model";

type Provider = { request: (input: { method: string; params?: unknown[] | object }) => Promise<unknown>; on?: (event: string, handler: (...args: unknown[]) => void) => void; removeListener?: (event: string, handler: (...args: unknown[]) => void) => void };
declare global { interface Window { ethereum?: Provider } }
type WalletState = { address: Address | null; busy: boolean; error: string | null; connect: () => Promise<Address>; disconnect: () => void };
const Context = React.createContext<WalletState | null>(null);
export function AxisWalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = React.useState<Address | null>(null), [busy, setBusy] = React.useState(false), [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;
    const changed = (...args: unknown[]) => { const accounts = args[0] as string[]; setAddress(accounts?.[0] as Address ?? null); };
    void provider.request({ method: "eth_accounts" }).then(accounts => changed(accounts)).catch(() => {});
    provider.on?.("accountsChanged", changed);
    return () => provider.removeListener?.("accountsChanged", changed);
  }, []);
  const connect = React.useCallback(async () => {
    setBusy(true); setError(null);
    try {
      if (!window.ethereum) throw new Error("Install an Ethereum browser wallet such as MetaMask to publish to Arkiv.");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as Address[];
      if (!accounts[0]) throw new Error("No wallet account was selected.");
      await switchToRabdi(); setAddress(accounts[0]); return accounts[0];
    } catch (caught) { setError(walletError(caught)); throw caught; } finally { setBusy(false); }
  }, []);
  return <Context.Provider value={{ address, busy, error, connect, disconnect: () => setAddress(null) }}>{children}</Context.Provider>;
}
export function useAxisWallet() { const value = React.useContext(Context); if (!value) throw new Error("Wallet provider is missing."); return value; }
export function walletError(error: unknown) {
  if ((error as { code?: number })?.code === 4001) return "The wallet request was declined.";
  return (error instanceof Error ? error.message : "Wallet request failed.").replace(/https?:\/\/[^\s"'`<>]+/g, "[RPC endpoint]").slice(0, 600);
}
async function switchToRabdi() {
  const provider = window.ethereum;
  if (!provider) throw new Error("No browser wallet is available.");
  try { await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x76edaf" }] }); }
  catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await provider.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x76edaf", chainName: "Arkiv Rabdi", nativeCurrency: { name: "Test GLM", symbol: "tGLM", decimals: 18 }, rpcUrls: ["https://rpc.rabdi.db-chain.testnet.arkiv.network"], blockExplorerUrls: ["https://rabdi.explorer.arkiv.network"] }] });
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x76edaf" }] });
  }
}
async function signer(account: Address) {
  await switchToRabdi();
  const provider = window.ethereum!;
  const current = await provider.request({ method: "eth_accounts" }) as string[];
  if (current[0]?.toLowerCase() !== account.toLowerCase()) throw new Error("Selected wallet account changed. Reconnect before publishing.");
  return createWalletClient({ account, chain: rabdi({ accessKey: "" }), transport: custom({ request: async ({ method, params }) => {
    if (["eth_sendTransaction", "eth_signTransaction", "personal_sign", "eth_signTypedData_v4"].includes(method)) return provider.request({ method, params });
    const response = await fetch("/api/axis/rpc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method, params: params ?? [], id: 1 }) });
    const result = await response.json();
    if (result.error) throw Object.assign(new Error(result.error.message ?? "Wallet RPC failed."), { code: result.error.code });
    return result.result;
  } }) });
}
export async function createDataset(account: Address, data: { name: string; description: string }) {
  if (!data.name.trim() || data.name.length > 80 || data.description.length > 2000) throw new Error("Use a dataset name of 1–80 characters and a description under 2000 characters.");
  const response = await fetch("/api/axis/config", { cache: "no-store" });
  const config = await response.json() as PlatformConfig;
  if (!response.ok || !config.writer || !config.finalizedBlock || !/^\d+$/.test(config.finalizedBlock)) throw new Error("The Polygon source is unavailable. Try again when finalized data is available.");
  const client = await signer(account);
  return afterAxisWrite(client.createEntity(DatasetSchema, { name: data.name.trim(), chainId: u64(137), contract: addr(USDC), writer: addr(config.writer), startBlock: u64(config.finalizedBlock), endBlock: u64(0), enabled: true, continuous: true, sourceTime: u64(Math.floor(Date.now() / 1000)), document: stringToBytes(JSON.stringify({ version: 1, description: data.description, source: "Polygon JSON-RPC", abiVersion: "ERC20.Transfer.v1" })) }, { expiration: ExpirationTime.fromDays(30) }));
}
export async function setDatasetEnabled(account: Address, entityKey: string, enabled: boolean) { return afterAxisWrite((await signer(account)).patchEntity(DatasetSchema, entityKey as Hex, { set: { enabled } })); }
export async function saveResultDataset(account: Address, data: { name: string; description: string; dataset: Dataset; filters: Filters; fromBlock: string; throughBlock: string; rows: number; sources?: { dataset: Dataset; filters: Filters; fromBlock: string; throughBlock: string }[] }) {
  if (!data.name.trim() || data.name.length > 80 || data.description.length > 2000) throw new Error("Use a dataset name of 1–80 characters and a description under 2000 characters.");
  if (!/^\d+$/.test(data.fromBlock) || !/^\d+$/.test(data.throughBlock) || BigInt(data.fromBlock) > BigInt(data.throughBlock) || !Number.isSafeInteger(data.rows) || data.rows < 0) throw new Error("Execute a verified query before saving a dataset.");
  const sources = data.sources ?? [{ dataset: data.dataset, filters: data.filters, fromBlock: data.fromBlock, throughBlock: data.throughBlock }];
  if (sources.some(source => source.dataset.writer !== data.dataset.writer || source.dataset.chainId !== data.dataset.chainId || source.dataset.contract !== data.dataset.contract)) throw new Error("Combined datasets must use the same verified record source.");
  const scopes = validateResultScopes(sources.flatMap(source => datasetScopes(source.dataset, source.throughBlock).map(scope => ({ ...scope, fromBlock: source.dataset.resultSource ? scope.fromBlock : source.fromBlock, filters: [...scope.filters, validateFilters(source.filters)] }))));
  const resultSource = { datasetKey: scopes[0].datasetKey, filters: scopes.length === 1 ? scopes[0].filters : [], rows: data.rows, ...(scopes.length > 1 ? { scopes } : {}) };
  return afterAxisWrite((await signer(account)).createEntity(DatasetSchema, { name: data.name.trim(), chainId: u64(data.dataset.chainId), contract: addr(data.dataset.contract as Address), writer: addr(data.dataset.writer as Address), startBlock: u64(data.fromBlock), endBlock: u64(data.throughBlock), enabled: true, continuous: false, sourceTime: u64(Math.floor(Date.now() / 1000)), document: stringToBytes(JSON.stringify({ version: 1, description: data.description, resultSource })) }, { expiration: ExpirationTime.fromDays(30) }));
}
export async function requestIngestion(account: Address, datasetKey: string) {
  const challengeResponse = await fetch("/api/axis/challenge", { cache: "no-store" });
  const challenge = await challengeResponse.json();
  const client = await signer(account);
  const signature = await client.signMessage({ account, message: jobMessage(datasetKey, challenge.nonce, challenge.timestamp) });
  const response = await fetch("/api/axis/ingestion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ datasetKey, ...challenge, signature }) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error); invalidateAxisReads(); return result;
}
export async function publishDashboard(account: Address, document: DashboardDocument, entityKey?: string) {
  validateDashboard(document);
  const client = await signer(account), values = { title: document.title.trim(), published: true, sourceTime: u64(Math.floor(Date.now() / 1000)), document: stringToBytes(JSON.stringify(document)) };
  if (entityKey) { const result = await afterAxisWrite(client.patchEntity(DashboardSchema, entityKey as Hex, { set: values })); return { entityKey: entityKey as Hex, txHash: result.txHash }; }
  return afterAxisWrite(client.createEntity(DashboardSchema, values, { expiration: ExpirationTime.fromDays(30) }));
}
export async function publishQuery(account: Address, title: string, query: QueryDefinition) {
  if (!title.trim() || title.length > 80) throw new Error("Enter a query title of 1–80 characters.");
  return afterAxisWrite((await signer(account)).createEntity(SavedQuerySchema, { title, datasetKey: key(query.datasetKey as Hex), sourceTime: u64(Math.floor(Date.now() / 1000)), document: stringToBytes(JSON.stringify({ ...query, filters: validateFilters(query.filters) })) }, { expiration: ExpirationTime.fromDays(30) }));
}
export async function renewEntity(account: Address, entityKey: string) { return afterAxisWrite((await signer(account)).extendEntity({ entityKey: entityKey as Hex, expiration: ExpirationTime.fromDays(30) })); }
export async function removeEntity(account: Address, entityKey: string) { return afterAxisWrite((await signer(account)).deleteEntity({ entityKey: entityKey as Hex })); }
export async function authorizeSnapshot(account: Address, intent: SnapshotIntent): Promise<SnapshotAuthorization> {
  const challenge = new Uint8Array(24); crypto.getRandomValues(challenge);
  const nonce = Array.from(challenge, byte => byte.toString(16).padStart(2, "0")).join(""), timestamp = Date.now();
  const client = await signer(account);
  const signature = await client.signMessage({ account, message: snapshotMessage(intent, nonce, timestamp, window.location.origin) });
  return { nonce, timestamp, signature };
}
export async function publishSnapshot(account: Address, input: SnapshotDocument) {
  const document = validateSnapshotDocument(input);
  if (document.publisher.toLowerCase() !== account.toLowerCase()) throw new Error("Use the wallet that authorized this Swarm upload.");
  const response = await fetch("/api/axis/swarm/publication", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document }) });
  const check = await response.json() as SnapshotPublicationCheck & { error?: string };
  if (!response.ok || check.verified !== true) throw new Error(check.error ?? "The archived files could not be verified before publication.");
  if (check.publication) return check.publication;
  return afterAxisWrite((await signer(account)).createEntity(SnapshotSchema, {
    title: document.title, swarmReference: document.swarmReference, manifestSha256: document.manifestSha256,
    chainId: u64(document.chainId), rows: u64(document.rowCount), fromBlock: u64(document.fromBlock), throughBlock: u64(document.throughBlock),
    sourceTime: u64(Math.floor(Date.parse(document.createdAt) / 1000)), document: stringToBytes(JSON.stringify(document)),
  }, { expiration: ExpirationTime.fromDays(30) }));
}
