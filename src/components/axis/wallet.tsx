"use client";
import * as React from "react";
import { createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { addr, key, u64 } from "@arkiv-network/sdk/schema";
import { custom, stringToBytes, type Address, type Hex } from "viem";
import { DatasetSchema, DashboardSchema, SavedQuerySchema } from "@/lib/axis/schemas";
import { USDC, type DashboardDocument, type QueryDefinition } from "@/lib/axis/model";
import { validateDashboard, validateBlockRange } from "@/lib/axis/core";
import { jobMessage } from "@/lib/axis/auth";

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
export async function createDataset(account: Address, data: { name: string; description: string; writer: string; startBlock: string; endBlock: string; continuous: boolean }) {
  if (!data.name.trim() || data.name.length > 80 || data.description.length > 2000) throw new Error("Use a dataset name of 1–80 characters and a description under 2000 characters.");
  if (data.endBlock !== "0") validateBlockRange(data.startBlock, data.endBlock);
  else if (!/^\d+$/.test(data.startBlock)) throw new Error("Invalid start block.");
  const client = await signer(account);
  return client.createEntity(DatasetSchema, { name: data.name.trim(), chainId: u64(137), contract: addr(USDC), writer: addr(data.writer), startBlock: u64(data.startBlock), endBlock: u64(data.endBlock), enabled: true, continuous: data.continuous, sourceTime: u64(Math.floor(Date.now() / 1000)), document: stringToBytes(JSON.stringify({ version: 1, description: data.description, source: "Polygon JSON-RPC", abiVersion: "ERC20.Transfer.v1" })) }, { expiration: ExpirationTime.fromDays(30) });
}
export async function setDatasetEnabled(account: Address, entityKey: string, enabled: boolean) { return (await signer(account)).patchEntity(DatasetSchema, entityKey as Hex, { set: { enabled } }); }
export async function requestIngestion(account: Address, datasetKey: string) {
  const challengeResponse = await fetch("/api/axis/challenge", { cache: "no-store" });
  const challenge = await challengeResponse.json();
  const client = await signer(account);
  const signature = await client.signMessage({ account, message: jobMessage(datasetKey, challenge.nonce, challenge.timestamp) });
  const response = await fetch("/api/axis/ingestion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ datasetKey, ...challenge, signature }) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
}
export async function publishDashboard(account: Address, document: DashboardDocument, entityKey?: string) {
  validateDashboard(document);
  const client = await signer(account), values = { title: document.title.trim(), published: true, sourceTime: u64(Math.floor(Date.now() / 1000)), document: stringToBytes(JSON.stringify(document)) };
  if (entityKey) { const result = await client.patchEntity(DashboardSchema, entityKey as Hex, { set: values }); return { entityKey: entityKey as Hex, txHash: result.txHash }; }
  return client.createEntity(DashboardSchema, values, { expiration: ExpirationTime.fromDays(30) });
}
export async function publishQuery(account: Address, title: string, query: QueryDefinition) {
  if (!title.trim() || title.length > 80) throw new Error("Enter a query title of 1–80 characters.");
  return (await signer(account)).createEntity(SavedQuerySchema, { title, datasetKey: key(query.datasetKey as Hex), sourceTime: u64(Math.floor(Date.now() / 1000)), document: stringToBytes(JSON.stringify(query)) }, { expiration: ExpirationTime.fromDays(30) });
}
export async function renewEntity(account: Address, entityKey: string) { return (await signer(account)).extendEntity({ entityKey: entityKey as Hex, expiration: ExpirationTime.fromDays(30) }); }
export async function removeEntity(account: Address, entityKey: string) { return (await signer(account)).deleteEntity({ entityKey: entityKey as Hex }); }
