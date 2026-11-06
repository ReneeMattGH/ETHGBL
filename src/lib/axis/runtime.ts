import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export function arkivEndpoint(): string {
  const base = process.env.ARKIV_RPC_URL?.trim() || "https://rpc.rabdi.db-chain.testnet.arkiv.network";
  const url = new URL(base), key = process.env.ARKIV_ACCESS_KEY?.trim();
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid Arkiv RPC configuration.");
  if (key && !url.pathname.replace(/\/+$/, "").endsWith(`/${encodeURIComponent(key)}`)) url.pathname = `${url.pathname.replace(/\/+$/, "")}/${encodeURIComponent(key)}`;
  return url.toString();
}
export const arkivReader = () => createPublicClient({ chain: rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY?.trim() ?? "" }), transport: http(arkivEndpoint(), { timeout: 20000, retryCount: 0 }) });
export function workerWriter() {
  const secret = process.env.AXIS_INDEXER_PRIVATE_KEY?.trim();
  if (!secret) throw new Error("The local worker signer is not configured.");
  const account = privateKeyToAccount(secret as Hex);
  if (process.env.AXIS_INDEXER_ADDRESS && account.address.toLowerCase() !== process.env.AXIS_INDEXER_ADDRESS.toLowerCase()) throw new Error("Worker signer does not match AXIS_INDEXER_ADDRESS.");
  return createWalletClient({ account, chain: rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY?.trim() ?? "" }), transport: http(arkivEndpoint(), { timeout: 30000, retryCount: 0 }) });
}
export function writerAddress() {
  const address = process.env.AXIS_INDEXER_ADDRESS;
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("Set the public AXIS_INDEXER_ADDRESS in .env.local.");
  return address.toLowerCase();
}
export function safeError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const field of ["ARKIV_ACCESS_KEY", "POLYGON_RPC_URL", "ARKIV_RPC_URL", "AXIS_INDEXER_PRIVATE_KEY"]) {
    const value = process.env[field]?.trim();
    if (value) {
      message = message.split(value).join("[redacted]");
      if (value.startsWith("http")) { try { for (const part of new URL(value).pathname.split("/")) if (part.length > 8) message = message.split(part).join("[redacted]"); } catch {} }
    }
  }
  return message.replace(/https?:\/\/[^\s"'`<>]+/g, "[RPC endpoint]").replace(/0x[0-9a-fA-F]{64}/g, "[hash]").slice(0, 1200);
}
export async function retryRead<T>(action: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await action(); } catch (error) {
      if (attempt + 1 >= attempts || /parse|ill-typed|invalid predicate|unauthorized|forbidden/i.test(safeError(error))) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.min(500 * 2 ** attempt, 4000)));
    }
  }
}
