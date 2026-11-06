export type NetworkId = "rabdi";

export type NetworkSummary = {
  id: NetworkId;
  name: string;
  label: string;
  chainId: number;
  testnet: boolean;
  explorerUrl: string;
  rpcHost: string;
  accessKeyUrl: string;
};

export const NETWORKS: Record<NetworkId, NetworkSummary> = {
  rabdi: {
    id: "rabdi",
    name: "Rabdi",
    label: "Rabdi Testnet",
    chainId: 7794095,
    testnet: true,
    explorerUrl: "https://rabdi.explorer.arkiv.network",
    rpcHost: "rpc.rabdi.db-chain.testnet.arkiv.network",
    accessKeyUrl: "https://hub.arkiv.network/access-keys",
  },
};

export const DEFAULT_NETWORK: NetworkId = "rabdi";

export const NETWORK_OPTIONS: NetworkSummary[] = Object.values(NETWORKS);

export function isNetworkId(value: unknown): value is NetworkId {
  return typeof value === "string" && Object.hasOwn(NETWORKS, value);
}

export function getNetwork(id: NetworkId): NetworkSummary {
  return NETWORKS[id];
}

/**
 * The SDK (`@arkiv-network/sdk` v1.0.1) exports two chains: `rabdi` and `localhost`.
 * Rabdi is the only public Arkiv network, so it is the only one offered here. A localhost
 * node would be unreachable from the deployment runtime and is intentionally omitted.
 */
export const SUPPORTED_NETWORKS_NOTE =
  "Rabdi is the only public Arkiv network exposed by the official SDK. Localhost nodes are not reachable from the hosted server.";
