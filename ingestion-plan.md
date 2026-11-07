# AXIS Polygon ingestion implementation plan

Status: source/protocol ingestion, optional curated enrichment, transaction publication and explorer integration implemented, 7 November 2026. See [curated adapters and coverage](docs/curated-ingestion.md) for the current adapter scope and limits. This plan covers all 40 catalog tables in `src/lib/axis/catalog.ts`, the ten curated collections, Polygon, and four protocols. It does not mark planned sources as indexed.

## Goal and acceptance

Build a resumable pipeline that imports real Polygon data, preserves source identities and exact integers, publishes verified records into Arkiv, and exposes scoped queries in the existing explorer. Curated views reuse protocol and chain records. Source records, derived records, and reference imports have separate counts.

Initial acceptance window: a fixed finalized Polygon interval. A table with no matching events is complete with zero rows only if its importer processed the whole declared scope. Pool/reserve/market discovery must include objects created before that interval. Full Polygon history and every token/pool are not implied by a recent-window import.

## Implemented foundation

- `npm.cmd run bulk -- capabilities`: read-only Polygon and Arkiv probes; sanitized machine-readable capability report.
- `extract`: full source blocks, transaction envelopes, receipts, all receipt logs, selected ERC-20 Transfer events, and selected-token metadata. Source identities include chain, transaction and log index. Token quantities remain decimal strings with per-contract decimals.
- Per-block NDJSON parts, SHA-256 hashes, fsynced temporary writes, atomic manifest checkpoints and a single-run lock. A restart verifies committed parts before continuing after the last block.
- Source chain/finalized-boundary checks, header continuity, receipt/transaction identity checks, duplicate/removed-log rejection, checkpoint source hash checks and final boundary checks.
- `verify`: offline source/decoded parity, counts, contiguous scope and file hashes. Incomplete runs cannot be exported as complete. Verification reconstructs receipts and re-decodes transfers from staged raw logs.
- `parquet`: persistent DuckDB table and six ZSTD Parquet tables with count readback. JSON payloads preserve uint256 strings. Native dependency is pinned to the DuckDB Node client's LTS release.
- `decode` / `verify-protocols`: eleven protocol tables covering observed QuickSwap V2 and Uniswap v3 pools/swaps/liquidity events and five Aave v3 Pool actions. Discovery checks factory registration at the source block, retaining call evidence. Aave provider/pool mapping is checked in every processed block. Unrelated lookalike events require retained rejection evidence; transient RPC failures fail the stage.
- `protocol-parquet`: eleven protocol tables with zero-row outputs for genuinely empty supported intervals, full content/count readback and file checksums. `dex-trades` / `lending-actions` are computed view counts, not extra physical records.
- `source-check`: re-queries source headers and all raw logs using `eth_getLogs`, checks exact logs against the receipt-derived journal, and independently re-decodes selected-token transfers. This compares different methods of the same provider, not independent-provider evidence.
- Source/runtime files are under ignored `.axis/bulk/`. Extraction/decoding do not load a signer. `publish` explicitly loads `.env.worker.local`, uses the configured Rabdi writer, and stores new `axis.bulk.import.v1` / `axis.bulk.record.v1` entities with 30-day retention.
- Publication reconciles record identities on restart, persists nonce intent before sends, serializes transactions with the existing worker, reads back complete payloads and only commits coverage after a complete block. The explorer reads trusted-owner manifests and excludes in-flight ordinals. Missing/expired counts fail explicitly. Legacy wallet datasets and USDC-labelled analytics retain their own scope.
- A 1,000-block source backfill has been launched. Provider rate limits prompted pacing and checkpoint-based retries; extraction, decoding and publication states are visible separately in the ingestion monitor. Large-scope publication is bounded by test-token spend checkpoints; prefill access remains unestablished.

NDJSON is the recovery journal; DuckDB and Parquet are analytical outputs. This is not an `arkiv-prefill` seed format. A table becomes available for a bulk import only after its source block was published and verified on Arkiv, not merely because extraction succeeded.

## Table-by-table source map

Stage status describes implemented adapters. A table becomes queryable only in an import whose complete published prefix explicitly includes it. Three trace tables are currently blocked by the source provider. Existing v1 Arkiv coverage remains separate.

### Ten curated collections: 15 tables

| Collection | Catalog ID / table | Source and transformation | Scope, dependencies and current stage |
| --- | --- | --- | --- |
| Token Registry & Lists | `token-metadata` / tokens.metadata | `eth_call` name/symbol/decimals + `eth_getCode` for explicit selected contracts | **Implemented**. Snapshot at start block; code hash is the selected address's runtime bytecode hash, not proof of a proxy implementation. Token metadata requires standard string-returning ABI. |
| Token Registry & Lists | `token-lists` / tokens.lists | Attributed publisher token lists filtered to chain 137 | **Implemented enrichment**. Attributed current publisher list, chain 137 only; version, license source, hash and fetched time. |
| Chain & Public RPC Registry | `chain-registry` / registry.chains | Polygon chain docs and chain configuration registry | **Implemented enrichment**. Polygon reference snapshot with source/hash/time; registry license attribution. |
| Chain & Public RPC Registry | `rpc-registry` / registry.rpc_endpoints | Attributed public endpoints + measured capability probes | **Implemented enrichment**. Public HTTPS entries only, without credentials, queries or placeholders; explicitly listed, not probed. |
| Address & Protocol Labels | `address-labels` / labels.addresses | Official protocol deployments and attributable labels | **Implemented enrichment**. Official deployment roles and start-block code presence; no real-world identity or historical validity claim. |
| Address & Protocol Labels | `protocol-addresses` / labels.protocol_addresses | Official deployments, factories, providers and upgrade history | **Implemented enrichment**. Official allowlisted protocol deployments, source and start-block bytecode presence; upgrade history excluded. |
| Function & Event Signatures | `function-signatures` / signatures.functions | Verified Sourcify ABIs and authoritative protocol ABIs | **Implemented enrichment**. ERC-20/protocol and selected Sourcify v2 ABI candidates, ABI hashes and provenance; collisions preserved. |
| Function & Event Signatures | `event-signatures` / signatures.events | Same ABIs, indexed-parameter layouts and topic hashes | **Implemented enrichment**. Canonical topics with full ABI/indexed layout; candidate provenance retained. |
| Wallet Activity Ratings | `wallet-ratings` / wallets.activity_ratings | Deterministic aggregates over verified indexed activity | **Implemented enrichment**. Top 100 observed transaction senders, deterministic activity-only model; exact interval and selection declared. |
| Wallet Activity Ratings | `rating-models` / wallets.rating_models | Published model specifications | **Implemented enrichment**. Versioned formula, inputs, scope, selection and interpretation published with ratings. |
| Token Transfers | `token-transfers` / tokens.transfers | Decode ERC-20 Transfer from selected contracts' raw logs | **Implemented**. Explicit contract list, decimals snapshot, integer base units; unrelated contracts remain raw logs. No mixed-token total. |
| Stablecoin Activity | `stablecoin-transfers` / stablecoins.transfers | Filter selected transfers by declared stablecoin registry | **Implemented view and Arkiv queries**. Explicit selected-token classification; no extra physical rows or peg/safety assertion. |
| DEX Trading | `dex-trades` / dex.trades | Normalized QuickSwap and Uniswap swap records | **Implemented view and Arkiv queries**. Observed verified V2/v3/Algebra V1 swap union; per-token signed units, no USD price source. |
| Lending & Borrowing | `lending-actions` / lending.actions | Union of verified Aave action tables | **Implemented view and Arkiv queries**. Union of five verified Aave Pool action tables; exact reserve/action units. |
| Prediction Markets | `prediction-trades` / prediction_markets.trades | Polymarket fills joined to market/outcome references | **Implemented enriched view**. One allowlisted Polymarket OrderFilled log per fill; maker/taker not duplicated. |

### Polygon chain: nine tables

| Catalog ID / table | Source and transformation | Scope, dependencies and current stage |
| --- | --- | --- |
| `polygon-blocks` / polygon.blocks | `eth_getBlockByNumber` | **Implemented** full headers for selected finalized interval; transaction hash list retained. |
| `polygon-transactions` / polygon.transactions | Full block transactions + `eth_getBlockReceipts` | **Implemented**. Per-transaction receipt fallback only for unsupported bulk method. Receipt status, fee fields and original RPC types retained. |
| `polygon-logs` / polygon.logs | All logs in each block's receipts | **Implemented**. All emitting addresses in the selected blocks, not only selected tokens. Raw topics and data retained. |
| `polygon-contracts` / polygon.contracts | Selected contracts' historical calls and bytecode hash; later Sourcify artifacts | **Implemented, limited** selected token metadata only. Not all deployed contracts or verified sources. |
| `polygon-decoded` / polygon.logs_decoded | Versioned ABI decoders over raw logs | **Implemented view**. Implemented ERC-20 and protocol decoders only; raw unknown logs remain outside this decoded subset. |
| `polygon-signatures` / polygon.signatures | Contract-to-ABI/signature references | **Implemented enrichment**. Selected contracts current Sourcify ABI/hash/match references; historical implementation validity unresolved. |
| `polygon-traces` / polygon.traces | `debug_traceTransaction`/block tracer with explicit callTracer result | **Implemented capability-gated adapter**. callTracer trees and stable call paths; configured Free-tier provider currently denies access. |
| `polygon-creation-traces` / polygon.creation_traces | CREATE/CREATE2 frames from successful tracing | **Implemented capability-gated adapter**. CREATE/CREATE2 frames and inherited revert state; live source currently blocked. |
| `polygon-decoded-traces` / polygon.traces_decoded | Trace calls + ABI valid at execution block | **Implemented capability-gated adapter**. Call selectors with explicit undecoded status until a block-valid implementation ABI exists; live source blocked. |

### Protocols: 16 tables

| Catalog ID / table | Source and transformation | Required dependencies / acceptance |
| --- | --- | --- |
| `quickswap-pools` / quickswap.pools | Official factory membership for observed pools; later factory history | **Implemented V2 and enrichment Algebra V1**. Historical official factory membership for observed active pools; global/newer-family discovery excluded. |
| `quickswap-swaps` / quickswap.swaps | Pool Swap events | **Implemented V2 and enrichment Algebra V1**. Exact signed token amounts and factory membership evidence. |
| `quickswap-liquidity` / quickswap.liquidity_events | V2 Mint/Burn; later Algebra and position events | **Implemented V2 Mint/Burn and enrichment Algebra V1 Mint/Burn/Collect**. Position-manager joins and newer families excluded. |
| `uniswap_v3-pools` / uniswap_v3.pools | Historical pool calls and official factory getPool | **Implemented, observed activity only**. Token pair, fee tier and factory registration; global discovery/deployment-block history planned. |
| `uniswap_v3-swaps` / uniswap_v3.swaps | Verified pool Swap events | **Implemented**. Signed amount0/amount1, recipient, price/tick and log identity retained. |
| `uniswap_v3-liquidity` / uniswap_v3.liquidity_events | Pool Mint/Burn/Collect; later position-manager joins | **Implemented pool events**. Position IDs and position-manager joins planned. Pilot zero; synthetic positive event-layout tests pass. |
| `aave-reserves` / aave_v3.reserves | PoolAddressesProvider, reserve lists and data-provider calls | **Implemented enrichment**. Complete getReservesList at first source block, provider/pool check, configuration and RAY indexes; no balance/USD claim. |
| `aave-supplies` / aave_v3.supplies | Pool Supply event | **Implemented** reserve/user/onBehalfOf/amount and indexed layout; synthetic positive tests, live primary window zero. |
| `aave-withdrawals` / aave_v3.withdrawals | Pool Withdraw event | **Implemented** reserve/user/to/amount; additional live one-block pilot contains a verified withdrawal. |
| `aave-borrows` / aave_v3.borrows | Pool Borrow event | **Implemented** borrower/beneficiary/rate mode/rate/amount; raw units retained; synthetic positive test. |
| `aave-repayments` / aave_v3.repayments | Pool Repay event | **Implemented** user/repayer/useATokens/amount; synthetic positive test. |
| `aave-liquidations` / aave_v3.liquidations | Pool LiquidationCall event | **Implemented** collateral/debt assets, covered/seized amounts and liquidator; synthetic positive test. Zero events valid for complete scoped ingestion. |
| `polymarket-markets` / polymarket.markets | Official market metadata API joined by condition/token IDs | **Implemented enrichment**. Current Gamma exact-token lookups for observed fills, validated IDs, source hashes/time; global discovery excluded. |
| `polymarket-trade_fills` / polymarket.trade_fills | Active and historical exchange versions' fill events | **Implemented enrichment**. Allowlisted original/v2 standard and negative-risk exchange layouts; one log per fill, no newer-exchange completeness claim. |
| `polymarket-outcome_tokens` / polymarket.outcome_tokens | Conditional-token identities + market mapping | **Implemented enrichment**. Exact condition/outcome/ERC-1155 token-ID mapping from current matched market metadata. |
| `polymarket-redemptions` / polymarket.redemptions | Conditional-token redemption events and payout data | **Implemented enrichment**. Canonical CTF redemption logs with redeemer, collateral, condition, parent collection, index sets and base-unit payout. |

## Backend milestones

1. **Foundation (implemented)**: source probes, recoverable staging, exact multi-token decoder, offline verification, DuckDB/Parquet export, table source map and live pilots.
2. **Publication contract (implemented for transactions)**: byte-bounded batches, SDK gas estimation, shared signer serialization, source-identity reconciliation, complete content readback and per-block coverage manifests. Source preparation is outside the signer lock. Test-token budget is checked between batches. Dedicated bulk-writer funding and operator-assisted prefill remain future throughput options, not assumed capabilities.
3. **Reference adapters (implemented within declared scope)**: attributed Polygon token lists, deployment/RPC registries, official interfaces and selected Sourcify v2 ABI references. Raw reference bodies and RPC evidence are cached, hashed and replayed offline. Historical proxy/compiler timelines and broad contract discovery remain future work.
4. **DEX adapters (implemented within declared scope)**: V2/v3 and Algebra V1 observed-pool membership, swaps and pool liquidity events. Global discovery, newer Algebra families and position-manager joins remain future work.
5. **Lending and prediction adapters (implemented within declared scope)**: five Aave actions plus full first-block reserve enumeration/configuration/indexes; allowlisted Polymarket v1/v2 fills, CTF redemptions and current exact-token market/outcome lookups. Newer exchange versions, global market discovery and independent-provider proofs remain outside scope.
6. **Traces and ratings (implemented; tracing provider-blocked)**: bounded callTracer trees with deterministic paths, creation frames and explicitly unknown ABI decoding; provider denial gates all three trace tables. Top-100 sender activity ratings publish an exact formula, selection and input interval; no trust/credit claim.
7. **Application integration (implemented for catalog)**: separate published imports, per-table availability, table-selective publication, ordinal pagination, counts, actual Arkiv queries and source/publication monitoring. Collection analytics use scoped records. Generalized saved dashboard measures remain a separate extension; mixed-token quantities are not sent to USDC-labelled analytics.
8. **Scale and operate**: 1,000-block validation only after disk/network sizing; then 24-hour scope, longer history, continuous finalized sync, retention and capacity monitoring. Separate extraction, decode, publication and source checkpoints. Backfill must not starve the live tail.

## Shared contracts and consistency

- Journal envelope v1: table ID, source ID, source block/hash/time, optional contract/transaction, lossless JSON payload and canonical-content SHA-256. Manifest binds chain 137, token selection, range, concurrency and metadata snapshots. Config hashing rejects reuse with altered inputs.
- Current metadata is read at the start block. This is not a historical metadata/upgrade timeline. Before long historical windows, add code/implementation and decimals change detection with block-valid decoder versions.
- A raw event is stored once in `polygon-logs`. A decoded transfer is a derived table row. Stablecoin and general transfer views must not create duplicate physical transfer rows or sum their counts as independent activity.
- A publication checkpoint advances only after every intended entity and manifest is read back. Expired or missing records invalidate complete totals. Retention must be explicitly selected; do not assume Sourcify's permanent-seed expiry is available through our current deployment.
- New raw logs are preserved even if no decoder exists. Decoder failure for a selected known ABI is a failed interval, not a silently skipped row. Optional enrichment needs its own missing/error state rather than invalidating unrelated raw extraction.
- Protocol manifests bind the exact source-part fingerprint, decoder definitions, deployment registry and membership evidence policy. A decoder change requires a new run rather than reusing obsolete results. Protocol output is recoverable per source block and does not refetch raw receipts. Unknown factory lookalikes are classified with retained call/revert evidence, and official factory getPair/getPool must return the emitting pool before its events can be decoded.
- Raw/source completeness is relative to the configured RPC's responses; this is not cryptographic verification of receipt proofs or protection against a provider returning consistently falsified data. Independent provider/receipt-root verification is future hardening.

## Scale constraints and remaining limitations

- The first version reads sequential blocks, with bounded concurrent fallback receipt and token-metadata reads. Atomic checkpoint after every block prioritizes recovery. Manifests are in memory and rewritten per block; before very large runs, segment manifests and batch checkpoints to avoid quadratic metadata I/O.
- One NDJSON part is limited to 64 MiB and one RPC response to 32 MiB. Oversized blocks fail explicitly; implement streamed/split parts before targeting those blocks. DuckDB memory is bounded at 512 MiB but may spill to disk.
- Resume and final verification re-read local committed parts. No historical Polygon re-download is needed for completed parts other than source checkpoint validation. Finalized reorgs still require a new reconciled run.
- Lock files deliberately remain after a process is killed. Inspect the PID before removing an abandoned lock; automatic unsafe lock stealing is not implemented.
- Parquet is rebuilt from verified journal parts. Local files and DuckDB are not accessible via public explorer APIs. Single-run locking serializes extraction and export.
- Source URL and access keys never enter manifests. Only source hostname is retained. Provider traffic still consumes its configured quota; no long backfill is launched automatically.
- Per-table Parquet counts do not mean those tables have been published to Arkiv. Existing UI remains honest about unsupported datasets.
- Observed-pool metadata does not include pools with no supported activity in the interval. Aave provider checks pin the selected Pool address per source block, but implementation/ABI upgrade history is still a future reference-data dependency for long historical scopes.

## Sourcify architecture reuse

Reference: https://github.com/Arkiv-Network/sourcify-arkiv-entity-processor

Reuse separation of source preparation, deterministic transformation, deduplication, manifest verification and incremental synchronization. Its offline seed generation is different from ordinary RPC publication. Its source filter and contract envelopes target Ethereum verified contracts; Polygon events need our own adapters. The pipeline's published historical benchmark is not an AXIS throughput guarantee or proof of prefill access on Rabdi.

Source documentation:

- https://docs.sourcify.dev/docs/repository/download-dataset/ (bulk contract artifacts; API for individual lookups)
- https://docs.quickswap.exchange/overview/contracts-and-addresses (V2 vs V3 Algebra deployments)
- https://github.com/Uniswap/v3-core/blob/main/contracts/interfaces/pool/IUniswapV3PoolEvents.sol
- https://www.aave.com/docs/aave-v3/smart-contracts/pool
- https://docs.polymarket.com/api-reference/predictions/overview
- https://docs.polygon.technology/pos/reference/rpc-endpoints
- https://duckdb.org/docs/stable/clients/node_neo/overview

## Verification gates

- Unit/integration: interrupted-run resume; changed scope; changed source checkpoint; block/log/receipt identity and duplicate rejection; malformed ERC-20 logs; exact uint256 with distinct decimals; corruption and rehashed derived-record tampering; export count parity and lossless Parquet readback; zero-row tables; bounded RPC bytes and sanitized provider failures.
- Live foundation: fixed five-block source scope; raw transaction/log counts, exact selected-token count, repeated offline verification, resumed completed run without receipt re-download, Parquet readback.
- Live protocol evidence: real V2/v3 swaps, factory registration and Aave withdrawal pilot; exact raw log cross-checks against separate RPC methods. Other action/liquidity event layouts have synthetic positive coverage and must receive broader live samples before historical production rollout.
- Publication: separate real testnet write/readback evidence, costs and nonce recovery; not satisfied by staging or mocked SDK tests.
- Protocols: independently checked source event samples and aggregate counts, empty intervals, pre-window object discovery, upgrades and decoder validity boundaries; no placeholder output to satisfy a row quota.
