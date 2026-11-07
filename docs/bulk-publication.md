# Bulk publication implementation and live evidence

Implemented 7 November 2026. This extends the earlier local-only [capability report](ingestion-capabilities.md).

## What is running

- `polygon-bulk-1000-v1`: fixed finalized Polygon interval 96,852,708–96,853,707. Background extraction resumes its durable checkpoints and automatically proceeds to protocol decoding and Arkiv publication. Source calls are paced at 750 ms by default; transient failures back off.
- `aave-live-pilot-v1`: complete real Arkiv publication and readback for block 96,852,752.
- `polygon-multitoken-v1`: publication of the five-block, multi-token/protocol pilot. It waits/retries when another job owns the shared signer.

The first Aave pilot had a 0.5 tGLM checkpoint allowance. The five-block pilot was resumed with a 2 tGLM allowance. The curated selection has a separate 0.5 tGLM allowance, and the 1,000-block pipeline has 1 tGLM. These are checked between batches and can be crossed by the final batch; definition creation and earlier uncertain writes may incur additional fees. They do not promise sufficient balance to publish every staged row. Extraction completion, publication progress and reached budgets remain distinct states.

At 04:11 IST the 1,000-block extraction completed with **1,002,567 staged physical records**: 1,000 headers, 77,721 transactions, 902,418 raw logs, 21,424 selected-token transfers, two token metadata snapshots and two selected contract records. The interval is 96,852,708–96,853,707; journal size is 1,535,462,277 bytes. Of the selected transfers, 19,230 are explicitly classified stablecoin transfers; that view is not added to the physical record count. Protocol decoding/publication follows separately.

The backfill's validated publication plan prioritizes 15 physical token/protocol/header tables within its existing 1 tGLM allowance. Raw transaction and log journals remain local; they are explicitly excluded from that publication. This covers more source blocks per allowance than copying every raw log. It does not promise that the entire 1,000-block selection fits the allowance.

Local process logs/status files are under ignored `.axis/bulk-jobs/`. The ingestion monitor reads their source-stage progress separately from trusted-writer manifests queried from Arkiv. Local files and `.env*` are excluded from the website's deployment traces; the built API trace was checked to contain no local runtime files or env files.

## First complete published import

At 03:45 IST, the Aave pilot's complete block was committed with **847 verified physical records**. Its Arkiv import key is:

`0x2f1595ca595093ed2b495ba2fc5c5175159d31d929903468d4eaa2a718ce24ae`

| Physical table | Records |
| --- | ---: |
| polygon.blocks | 1 |
| polygon.transactions | 76 |
| polygon.logs | 747 |
| tokens.transfers | 14 |
| tokens.metadata | 2 |
| polygon.contracts | 2 |
| quickswap.pools | 1 |
| quickswap.swaps | 1 |
| uniswap_v3.pools | 1 |
| uniswap_v3.swaps | 1 |
| aave_v3.withdrawals | 1 |

Supported empty protocol tables return zero after verified coverage. Stablecoin, DEX, lending and decoded-log views reuse these records; their counts are not added to the physical record count.

The publisher recorded 45 confirmed transactions and approximately 0.22528 tGLM in tracked transaction fees. This excludes definition creation and an earlier interrupted readback attempt; it is not the full account spend. The observed ordinary-RPC path takes minutes for hundreds of records and must not be equated with Sourcify's offline seed-generation benchmark.

A second publication invocation reconciled all 847 source records and the complete manifest without writing additional records or increasing the tracked transaction count. The first live readback exposed the SDK's checksummed address representation; normalization was corrected and the existing rows were reused, rather than rewritten.

## Curated publication proof

At 04:18 IST, `curated-pilot-v2` completed a selected publication for source block 96,852,752 with **444 verified records** (one source header and 443 enrichment rows). Import key:

`0xe894543e1510292cf679849ee143aaa3ec42bd84ea60ae9991b662f5923f605c`

| Enrichment | Rows |
| --- | ---: |
| Polygon token-list entries | 197 |
| Chain / public RPC registry | 1 / 9 |
| Address labels / protocol deployments | 9 / 9 |
| Function / event signatures | 32 / 27 |
| Selected contract ABI associations | 2 |
| Wallet activity ratings / model | 75 / 1 |
| Aave reserve snapshots | 21 |
| Polymarket fills / CTF redemptions | 41 / 13 |
| Market references / outcome tokens | 2 / 4 |

The publisher tracked 23 confirmed transactions and 0.107460992 tGLM, excluding definition creation and the earlier uncommitted v1 attempt. Long outcome identities exposed Arkiv's 128-byte string limit during preflight; policy v2 now keeps compact hashed keys and full identities in documents. The rejected v1 attempt never committed a visible source block.

All five sampled table APIs returned their exact expected counts. The real-network browser test verified source attribution, lossless long outcome IDs, mobile layout and the provider denial shown for trace tables. Enrichment DuckDB/Parquet export produced 18 checked physical tables (443 rows, 131,894 compressed bytes); zero-row trace files retain explicit unavailable coverage.

The catalog's 40 mappings now have adapters, with 37 available across the scoped verified imports and three live trace tables blocked by the configured provider. This is not full-history or global protocol coverage. The header overlaps the original Aave pilot's source block and must not be counted as another unique block.

## Storage and query contract

`axis.bulk.record.v1` stores an import key, physical table ID, source identity, block/hash/time, ordinal, optional contract/transaction/stablecoin fields, content hash and lossless JSON document. The original staged content is reconstructed and compared after writes. `axis.bulk.import.v1` stores configuration/decoder/source fingerprints, implemented scope, per-table counts and the complete committed source prefix.

A source block is visible only after all intended raw/token/protocol rows for it have passed content readback. Explorer queries constrain owner, import key, committed ordinal count, source range and physical table/view predicates. Actual counts must equal the manifest's expected count; missing or expired records produce an explicit reconciliation error. Queries never silently include a partially published next block.

The existing USDC dataset and query/dashboard workflow remains separate. The explorer resolves a verified publication per table and exposes its native Arkiv query and source scope in Provenance. Collection analytics use scoped protocol/reference records and token-separated activity counts. Generalized saved dashboard measures over arbitrary bulk tables remain a separate extension; mixed-token quantities are not presented as USDC amounts.

## Signer, recovery and retention

The publisher and live worker share a signer lock for individual batches and manifest commits. A short acquisition window between bulk batches allows waiting workers/imports to acquire the lock. Latest/pending nonce checks prevent writes over unresolved transactions. A nonce intent is persisted before each bulk send, and restart reconciles source identities before another send. Coverage still advances only after a whole selected source block passes readback.

The live importer now validates the most recent canonical source boundary, whose hash commits to its ancestry, and explicitly checks that a new interval's first block links to that boundary. It no longer re-downloads every historical block hash for every two-block incremental job.

Bulk entities have 30-day lifetimes. Worker renewal covers both bulk schemas and pages through expiring entities in bounded transactions rather than using a 20,000-row scan ceiling. Existing source/cursor files and unrelated datasets are retained.

## Validation

- Publisher tests: complete publication, idempotent replay, uncertain successful sends, pending nonce rejection, corrupt readback, budgets and batch limits.
- Published-store tests: owner/import/committed-prefix predicates, view filters, missing/expired count rejection and checksummed-address normalization.
- Shared-writer and source-boundary tests: signer serialization, pending nonces, historical continuity.
- Real-network browser test: published Aave withdrawal, native query provenance, raw Polygon logs, mobile overflow and live bulk-job monitor.
- Full unit suite, TypeScript, focused lint and production build were run. The production build's filesystem tracing warnings were resolved by isolating local job reads from CLI staging code and excluding runtime/env files.

No prefill privileges have been established. Trace tables remain unavailable on the tested Polygon Free tier. The [curated enrichment stage](curated-ingestion.md) adds reference registries/signatures/labels, observed QuickSwap Algebra V1 events, start-block Aave reserves, allowlisted Polymarket v1/v2 fills/CTF redemptions, market/outcome references and scoped activity ratings. Global pool discovery, newer exchange families and historical proxy implementation timelines remain outside the declared scope.
