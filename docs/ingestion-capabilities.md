# Ingestion capability and live pilot report

Snapshot: 7 November 2026, approximately 03:08–03:23 IST. These are bounded live checks, not guarantees about historical coverage, provider throughput or current worker totals. No private keys or credential-bearing URLs are included.

## Infrastructure

The configured Polygon endpoint is hosted by `polygon-mainnet.g.alchemy.com`. It returned chain 137, finalized headers, historical block 96,852,708 with 76 transactions, all 76 block receipts, individual receipts, USDC logs, historical bytecode and a historical decimals call. The capability report's finalized boundary was 96,863,774.

The sampled `debug_traceTransaction` request failed with the provider's message: tracing is unavailable on the Free tier. Trace-based tables cannot be populated using the tested configuration. No plan upgrade or account change was made.

The Arkiv endpoint at `rpc.rabdi.db-chain.testnet.arkiv.network` returned chain 7,794,095 and a successful trusted-writer query. The report observed 270 v1 block entities at Arkiv block 307,675. That is a snapshot of the existing importer, not a count of newly staged data.

| Capability | Result | Practical limit |
| --- | --- | --- |
| Polygon chain/finalized reads | Passed | Boundary is fixed separately for each extraction run |
| Historical blocks, receipts, bytecode and state calls | Passed at selected samples | Full archive coverage not established |
| Bulk block receipts | Passed | Maximum response/throughput not benchmarked |
| Separate raw-log queries | Passed | Final cross-check used one block per request |
| Tracing | Failed: provider tier | No trace or internal-creation coverage claimed |
| Arkiv query access | Passed | Does not establish writer gas/throughput or prefill access |
| Operator-assisted prefill | Not established | Seed-generation speed is not transaction-publication speed |
| New bulk publication | Not performed | Staging is local; existing worker remains independent |

Machine-readable report: `.axis/bulk/capabilities.json` (ignored local runtime data). Refresh with `npm.cmd run bulk -- capabilities --block 96852708 --traces`.

## Five-block multi-token pilot

Run: `polygon-multitoken-v1`, inclusive blocks **96,852,708–96,852,712**. Selected contracts: native USDC (6 decimals) and wrapped POL at the WMATIC deployment address (18 decimals). Metadata was read onchain at the start block. Stablecoin classification was explicit configuration.

| Table | Verified local rows |
| --- | ---: |
| Polygon blocks | 5 |
| Transactions with receipts | 430 |
| Raw logs from all emitting contracts | 5,495 |
| Selected-token transfers | 84 |
| Selected contract snapshots | 2 |
| Token metadata snapshots | 2 |
| Observed QuickSwap V2 pools | 4 |
| QuickSwap V2 swaps | 7 |
| Observed Uniswap v3 pools | 3 |
| Uniswap v3 swaps | 4 |
| Supported pool liquidity events | 0 |
| Supported Aave Pool actions in this interval | 0 |

The 84 transfers comprise 83 native-USDC events and one wrapped-POL event. The stablecoin subset reuses those 83 USDC rows. DEX Trading is a view over the eleven swaps, not eleven additional physical events. Pool snapshots cover supported observed activity; inactive pools are not enumerated.

Initial extraction took approximately **4.1 seconds and 26 RPC calls**, including metadata and verification. Journal size was **9,077,910 bytes**. Source density varies; do not extrapolate this sample into a promised chain-wide/day-long rate. Protocol enrichment used 43 RPC calls, including source-boundary, pool/factory and per-block Aave-provider checks. That is separate from initial extraction.

The raw extraction produced six Parquet files with verified counts, complete row readback and SHA-256 checksums. Protocol decoding produced eleven separate Parquet files; supported tables with no events have genuine zero-row outputs. All new output is local-only.

`source-check` made 12 additional requests. All **5,495 raw logs and 84 selected-token transfers** matched separate `eth_getLogs` queries and current source headers. A previous single-token cross-check also matched 83 transfers and exact total `283120461896` USDC base units. These are different-method checks against the same provider, not independent-provider consensus or receipt proofs.

## Positive live Aave sample

Run: `aave-live-pilot-v1`, block **96,852,752**. A bounded search found a Withdraw event at the official Pool address. The complete source block was then extracted and verified:

| Item | Result |
| --- | ---: |
| Transactions with receipts | 76 |
| Raw logs | 747 |
| Selected-token transfers | 14 |
| QuickSwap V2 swaps | 1 |
| Uniswap v3 swaps | 1 |
| Aave v3 withdrawals | 1 |

Historical PoolAddressesProvider mapping was checked, the withdrawal was decoded from retained raw evidence and exported to Parquet with readback verification. A separate source check matched all 747 logs and 14 selected-token transfers. Live positive samples for the other four Aave actions and pool-liquidity events remain to be collected; synthetic tests cover their ABI layouts.

## Verification and remaining work

Automated coverage includes source identity consistency, incomplete-run recovery, changed configurations/checkpoints, checksums, tampered derived amounts, per-token units and full uint256, actual DuckDB/Parquet round trips, all twelve supported protocol event layouts, official factory membership, unrelated pool lookalikes, transient failures, malformed events, protocol resume, zero-row exports and separate-source-query mismatches.

Final checks passed: **101 tests across 17 test files**, TypeScript checking, focused ESLint for the new pipeline/CLI, and diff whitespace checks. These are separate from the live checks above. The runbook documents reproducible commands; local manifests/reports retain precise configuration hashes and file checksums. A scan of the 23 touched implementation/documentation/package files found no configured credential values.

Still required before the new data appears in the website: safe Arkiv publication/readback, generalized dataset/catalog queries, reference imports, global pool/reserve discovery, Algebra/position-manager coverage, Polymarket, trace-capable infrastructure and a documented wallet activity model. A long historical backfill has not been launched.
