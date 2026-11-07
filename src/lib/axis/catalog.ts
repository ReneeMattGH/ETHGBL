export type CatalogView = "curated" | "chains" | "protocols";
export type PreviewKind = "transfers" | "blocks" | "contracts" | "bulk";
export type CatalogTable = { id: string; name: string; description: string; preview?: PreviewKind; schema?: string; datasetScoped?: boolean; columns?: string[] };
export type CatalogEntry = { id: string; name: string; description: string; icon: string; tables: string[]; related?: string[]; docs?: string; note: string };

// Discovery metadata describes the agreed catalog. It does not create or simulate data.
export const CATALOG_TABLES: CatalogTable[] = [
  { id: "token-metadata", name: "tokens.metadata", description: "Contract metadata already published by the Polygon importer.", preview: "contracts", schema: "axis.contract.v1", columns: ["symbol", "contract", "decimals", "abiVersion"] },
  { id: "token-lists", name: "tokens.lists", description: "Versioned token lists with publisher and source attribution." },
  { id: "chain-registry", name: "registry.chains", description: "Chain identifiers, explorers, native assets and capabilities." },
  { id: "rpc-registry", name: "registry.rpc_endpoints", description: "Public RPC endpoints with capability and observation metadata." },
  { id: "address-labels", name: "labels.addresses", description: "Attributed address labels with source and validity information." },
  { id: "protocol-addresses", name: "labels.protocol_addresses", description: "Versioned mappings between protocols, contracts and roles." },
  { id: "function-signatures", name: "signatures.functions", description: "Function selectors and candidate signatures with provenance." },
  { id: "event-signatures", name: "signatures.events", description: "Event topics and their canonical signatures." },
  { id: "wallet-ratings", name: "wallets.activity_ratings", description: "Activity scores with methodology, model version and coverage." },
  { id: "rating-models", name: "wallets.rating_models", description: "Published scoring definitions and their input dependencies." },
  { id: "token-transfers", name: "tokens.transfers", description: "Decoded native USDC Transfer events within verified Polygon coverage.", preview: "transfers", schema: "axis.transfer.v1", datasetScoped: true, columns: ["blockNumber", "txHash", "sender", "recipient", "amount"] },
  { id: "stablecoin-transfers", name: "stablecoins.transfers", description: "The same verified USDC records, discovered through the stablecoin collection.", preview: "transfers", schema: "axis.transfer.v1", datasetScoped: true, columns: ["blockNumber", "txHash", "sender", "recipient", "amount"] },
  { id: "dex-trades", name: "dex.trades", description: "A common trading model across supported Polygon DEX integrations." },
  { id: "lending-actions", name: "lending.actions", description: "Normalized supply, borrow, repayment, withdrawal and liquidation activity." },
  { id: "prediction-trades", name: "prediction_markets.trades", description: "Normalized prediction-market trade fills with market references." },
  { id: "polygon-blocks", name: "polygon.blocks", description: "Block headers associated with verified imported records.", preview: "blocks", schema: "axis.block.v1", datasetScoped: true, columns: ["blockNumber", "blockHash", "sourceTime", "chainId"] },
  { id: "polygon-transactions", name: "polygon.transactions", description: "Transaction envelopes, receipts, execution status and fees." },
  { id: "polygon-logs", name: "polygon.logs", description: "Raw event topics and data before ABI decoding." },
  { id: "polygon-contracts", name: "polygon.contracts", description: "Imported contract metadata. Current coverage is native USDC.", preview: "contracts", schema: "axis.contract.v1", columns: ["symbol", "contract", "decimals", "abiVersion"] },
  { id: "polygon-decoded", name: "polygon.logs_decoded", description: "Decoded USDC Transfer events; additional event decoders are not indexed yet.", preview: "transfers", schema: "axis.transfer.v1", datasetScoped: true, columns: ["blockNumber", "txHash", "sender", "recipient", "amount"] },
  { id: "polygon-signatures", name: "polygon.signatures", description: "Contract-associated event and function signatures." },
  { id: "polygon-traces", name: "polygon.traces", description: "Execution traces. Requires a verified tracing-capable source and importer." },
  { id: "polygon-creation-traces", name: "polygon.creation_traces", description: "Contract-creation traces and deployment relationships." },
  { id: "polygon-decoded-traces", name: "polygon.traces_decoded", description: "ABI-decoded calls derived from execution traces." },
  ...(["quickswap", "uniswap_v3"] as const).flatMap(protocol => [
    { id: `${protocol}-pools`, name: `${protocol}.pools`, description: "Pool addresses, token pairs and protocol versions." },
    { id: `${protocol}-swaps`, name: `${protocol}.swaps`, description: "Decoded swaps with exact token amounts and source references." },
    { id: `${protocol}-liquidity`, name: `${protocol}.liquidity_events`, description: "Liquidity additions, removals and position activity." },
  ]),
  ...["reserves", "supplies", "withdrawals", "borrows", "repayments", "liquidations"].map(kind => ({ id: `aave-${kind}`, name: `aave_v3.${kind}`, description: `Polygon Aave v3 ${kind} with contract and source-event provenance.` })),
  ...["markets", "trade_fills", "outcome_tokens", "redemptions"].map(kind => ({ id: `polymarket-${kind}`, name: `polymarket.${kind}`, description: `Polygon Polymarket ${kind.replaceAll("_", " ")} with versioned market references.` })),
];

export const CURATED_COLLECTIONS: CatalogEntry[] = [
  { id: "token-registry", name: "Token Registry & Lists", icon: "tokens", description: "Discover token contracts, metadata and attributed token lists.", tables: ["token-metadata", "token-lists"], note: "Imported metadata currently covers native USDC. External token-list mirroring is not indexed yet." },
  { id: "chain-rpc", name: "Chain & Public RPC Registry", icon: "network", description: "Discover networks, public endpoints and their capabilities.", tables: ["chain-registry", "rpc-registry"], note: "Registry sources and refresh policies will be connected before records are published." },
  { id: "address-labels", name: "Address & Protocol Labels", icon: "labels", description: "Understand the protocols and contract roles behind onchain addresses.", tables: ["address-labels", "protocol-addresses"], note: "Labels require attributed sources and a valid republication basis." },
  { id: "signatures", name: "Function & Event Signatures", icon: "code", description: "Explore selectors, event topics and their candidate signatures.", tables: ["function-signatures", "event-signatures"], note: "Signature candidates will retain provenance; selectors alone do not establish a unique ABI." },
  { id: "wallet-ratings", name: "Wallet Activity Ratings", icon: "wallet", description: "Compare observed wallet activity using documented scoring models.", tables: ["wallet-ratings", "rating-models"], note: "A scoring methodology and coverage policy must be agreed before ratings are published." },
  { id: "token-transfers", name: "Token Transfers", icon: "transfer", description: "Follow token movement across wallets and contracts on Polygon.", tables: ["token-transfers"], note: "Current coverage is native USDC Transfer events in each verified dataset." },
  { id: "stablecoins", name: "Stablecoin Activity", icon: "stablecoins", description: "Explore stablecoin transfer activity and participating wallets.", tables: ["stablecoin-transfers"], note: "Native USDC is available. Other stablecoin contracts are not indexed yet." },
  { id: "dex", name: "DEX Trading", icon: "dex", description: "Explore standardized trading activity across Polygon exchanges.", tables: ["dex-trades"], related: ["quickswap", "uniswap-v3"], note: "Protocol-specific ingestion and trade normalization are not connected yet." },
  { id: "lending", name: "Lending & Borrowing", icon: "lending", description: "Explore lending flows, borrowing and liquidation activity.", tables: ["lending-actions"], related: ["aave-v3"], note: "Aave v3 decoding and analytical models are not indexed yet." },
  { id: "prediction", name: "Prediction Markets", icon: "prediction", description: "Explore prediction-market fills, outcomes and market activity.", tables: ["prediction-trades"], related: ["polymarket"], note: "Settlement decoding and market metadata ingestion are not connected yet." },
];
export const CHAINS: CatalogEntry[] = [
  { id: "polygon", name: "Polygon", icon: "polygon", description: "Explore source records and decoded activity on Polygon PoS mainnet.", tables: ["polygon-blocks", "polygon-contracts", "polygon-creation-traces", "polygon-logs", "polygon-decoded", "polygon-signatures", "polygon-traces", "polygon-decoded-traces", "polygon-transactions"], docs: "https://docs.polygon.technology/pos/", note: "Available records cover verified USDC datasets. Full-chain transactions, raw logs and execution traces are not indexed." },
];
export const PROTOCOLS: CatalogEntry[] = [
  { id: "quickswap", name: "QuickSwap", icon: "quickswap", description: "Explore Polygon swaps, token pairs and liquidity activity.", tables: ["quickswap-pools", "quickswap-swaps", "quickswap-liquidity"], docs: "https://docs.quickswap.exchange/overview/contracts-and-addresses", note: "The QuickSwap integration is planned. No protocol records have been imported." },
  { id: "uniswap-v3", name: "Uniswap v3", icon: "uniswap", description: "Explore concentrated-liquidity pools and swaps on Polygon.", tables: ["uniswap_v3-pools", "uniswap_v3-swaps", "uniswap_v3-liquidity"], docs: "https://developers.uniswap.org/docs/protocols/v3/deployments/v3-polygon-deployments", note: "The Uniswap v3 integration is planned. No protocol records have been imported." },
  { id: "aave-v3", name: "Aave v3", icon: "aave", description: "Explore Polygon lending, borrowing and liquidation events.", tables: ["aave-reserves", "aave-supplies", "aave-withdrawals", "aave-borrows", "aave-repayments", "aave-liquidations"], docs: "https://aave.com/help/aave-101/accessing-aave", note: "The Aave v3 integration is planned. No protocol records have been imported." },
  { id: "polymarket", name: "Polymarket", icon: "polymarket", description: "Explore Polygon prediction-market trades and settlement activity.", tables: ["polymarket-markets", "polymarket-trade_fills", "polymarket-outcome_tokens", "polymarket-redemptions"], docs: "https://github.com/Polymarket/ctf-exchange-v2", note: "The Polymarket integration is planned. No protocol records have been imported." },
];
export const CATALOG_GROUPS: Record<CatalogView, CatalogEntry[]> = { curated: CURATED_COLLECTIONS, chains: CHAINS, protocols: PROTOCOLS };
export const CATALOG_DEFAULTS: Record<CatalogView, string> = { curated: "token-transfers", chains: "polygon", protocols: "quickswap" };
export const catalogTable = (id: string) => CATALOG_TABLES.find(table => table.id === id);
