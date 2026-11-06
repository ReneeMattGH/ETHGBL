import "server-only";

import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http } from "viem";
import type { NetworkId } from "../networks";

const accessKey = process.env.ARKIV_ACCESS_KEY?.trim() ?? "";

export const arkivAccessKeyConfigured = accessKey.length > 0;

export const RABDI_RPC_HOST = "rpc.rabdi.db-chain.testnet.arkiv.network";

export class ArkivConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArkivConfigurationError";
  }
}

export const queryTimeoutMs = (() => {
  const parsed = Number(process.env.ARKIV_QUERY_TIMEOUT_MS);
  if (!Number.isFinite(parsed)) return 15_000;
  return Math.min(Math.max(Math.round(parsed), 3_000), 60_000);
})();

type ResolvedRpcUrl = {
  url: string | null;
  host: string;
  custom: boolean;
  error: string | null;
};

function resolveRpcUrl(): ResolvedRpcUrl {
  const configured = process.env.ARKIV_RPC_URL?.trim() ?? "";
  if (!configured) {
    return { url: null, host: RABDI_RPC_HOST, custom: false, error: null };
  }

  try {
    const url = new URL(configured);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
    // The Arkiv access key is the final path segment of the RPC URL. Appending it here keeps a
    // configured base URL working without asking operators to concatenate secrets themselves.
    if (accessKey) {
      const encoded = encodeURIComponent(accessKey);
      const basePath = url.pathname.replace(/\/+$/, "");
      if (!basePath.endsWith(`/${encoded}`)) {
        url.pathname = `${basePath}/${encoded}`;
      }
    }
    return { url: url.toString(), host: url.host, custom: true, error: null };
  } catch {
    return {
      url: null,
      host: RABDI_RPC_HOST,
      custom: true,
      error: "ARKIV_RPC_URL must be a valid http(s) URL, for example https://rpc.rabdi.db-chain.testnet.arkiv.network.",
    };
  }
}

const resolvedRpcUrl = resolveRpcUrl();

export const arkivRpcUrl = resolvedRpcUrl.url;
export const arkivRpcHost = resolvedRpcUrl.host;
export const arkivRpcUrlOverridden = resolvedRpcUrl.custom;
export const arkivConfigurationError = resolvedRpcUrl.error;

/**
 * The access key lives in the chain's RPC URL, so it must stay on the server.
 * The chain is built lazily; a client is created per request so cancellation can be wired
 * into the transport without sharing an aborted signal between requests.
 */
let chainCache: ReturnType<typeof rabdi> | null = null;

function arkivChain(): ReturnType<typeof rabdi> {
  chainCache ??= rabdi({ accessKey });
  return chainCache;
}

export function createArkivClient(signal?: AbortSignal) {
  if (arkivConfigurationError) throw new ArkivConfigurationError(arkivConfigurationError);

  return createPublicClient({
    chain: arkivChain(),
    transport: http(arkivRpcUrl ?? undefined, {
      timeout: queryTimeoutMs,
      retryCount: 0,
      fetchOptions: signal ? { signal } : undefined,
    }),
  });
}

export function assertNetwork(id: string): NetworkId {
  if (id !== "rabdi") {
    throw new Error(`Unsupported Arkiv network: ${id}`);
  }
  return id;
}
