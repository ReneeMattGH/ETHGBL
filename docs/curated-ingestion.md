# Curated ingestion and coverage

Implemented 7 November 2026. The catalog has 40 table mappings. The original block/token/protocol pipeline supports 21 mappings. An optional independently versioned enrichment stage adds the remaining 19 mappings; three depend on a trace-capable provider. Availability is declared per import and table. A definition or an extracted local file does not make a table available on Arkiv.

## Running the pipeline

```powershell
npm.cmd run bulk:job -- --run polygon-curated-window --blocks 5 --tokens examples/bulk-tokens.json --enriched --traces --max-spend 1
```

The phases are extract, decode, enrich, publish. The selected finalized interval is fixed on the first extraction. Repeat the same command to reconcile checkpoints after a transient failure. An enrichment decoder/options change requires a new run. An abandoned `extract.lock` is removed only after confirming its recorded PID has exited; active locks are never deleted to force a second writer.

For an already decoded run:

```powershell
npm.cmd run bulk -- enrich --run polygon-curated-window --traces
npm.cmd run bulk -- verify-enrichment --run polygon-curated-window
npm.cmd run bulk -- enrichment-parquet --run polygon-curated-window
npm.cmd run bulk -- publish --run polygon-curated-window --enriched --max-spend 1
```

`--tables` publishes a comma-separated catalog selection, including its physical dependencies and one header per source block. This allows publishing reference and protocol records without copying every raw log. Omitted tables remain unavailable in that import. Separate selections use separate import hashes and fee journals. Overlapping windows/publications must not be added together as unique Polygon activity.

An optional `.axis/bulk/<run>/publication-plan.json` supplies a validated selection for background jobs: `{"version":1,"enriched":false,"tables":["token-transfers","quickswap-swaps","uniswap_v3-swaps"]}`. Explicit CLI flags override those plan values. The plan cannot alter a spend allowance. Its selection is included in the publication identity and manifest; changing it creates a distinct publication. Selecting a table whose adapter has not been verified fails before creating an import.

```powershell
npm.cmd run bulk -- publish --run polygon-curated-window --enriched --tables token-lists,chain-registry,rpc-registry,address-labels,protocol-addresses,function-signatures,event-signatures,polygon-signatures,wallet-ratings,rating-models,aave-reserves,polymarket-markets,polymarket-outcome_tokens,polymarket-trade_fills,polymarket-redemptions --max-spend 0.5
```

`--max-spend` is a checkpoint allowance in testnet tGLM, checked between batches. A final batch can cross it; definition creation and an uncertain prior send may add fees. It is not a quote or a strict transaction-level fee cap. Never assume a million locally staged records can be published with this allowance.

## Sources and exact scope

| Tables | Source and scope |
| --- | --- |
| Token lists | Uniswap Labs default list, filtered to chain 137. Publisher, list version, source hash, repository license attribution and fetched time retained. List membership is not a safety endorsement or historical onchain metadata. |
| Chain and RPC registries | `ethereum-lists/chains` Polygon snapshot. Only public HTTPS entries without query strings, credentials or variable placeholders are republished. Endpoints are labelled **listed; not probed**. The configured credential-bearing RPC URL is never imported. |
| Protocol and address labels | Explicit official factory/provider/pool/exchange/CTF deployments. Historical code presence is checked at the first source block. This does not establish deployment dates, upgrade timelines or real-world identities. |
| Function/event signatures | ERC-20 and implemented protocol interfaces plus selected contracts' Sourcify v2 ABIs. Indexed layouts and canonical candidates retained separately. Selector collisions remain candidates. |
| Contract signature associations | Selected contracts' current Sourcify references with match status and ABI hash. No claim that a current proxy ABI identifies the implementation executing in a historical block. A missing ABI has an explicit status. |
| Aave reserves | Provider-to-pool identity, complete `getReservesList` at the first source block, configuration bitmap and normalized income/debt indexes. Indexes are RAY base units, not token balances or USD values. |
| QuickSwap Algebra | V1 Algebra pool Swap/Mint/Burn/Collect events in the source logs. Historical `factory`, `token0`, `token1` and official `poolByPair` must agree. Observed active pools only; newer Algebra families and global factory discovery excluded. Existing V2 and Uniswap v3 decoding remains compatible. |
| Polymarket fills/redemptions | Allowlisted original CTF Exchange and v2 standard/negative-risk exchanges, with separate v1/v2 fill layouts; canonical CTF redemption events. One `OrderFilled` log is one row. Newer exchanges and non-allowlisted deployments are excluded. Wrapped pUSD collateral is not labelled USDC. |
| Markets and outcome tokens | Exact Gamma API lookups for token IDs observed in those fills. Returned token IDs must match the requested filter; outcome and token arrays must align. Current API snapshots only, with response hashes and fetched times. Outcome IDs are ERC-1155 identities. No global market-discovery claim. |
| Ratings/model | Top 100 transaction senders in the declared interval, ranked by transaction count then address. Formula `min(100, 2 * transactions + 5 * activeBlocks)`. All other senders are outside the published selection. Activity only; no trust, credit or wallet identity assertion. No mixed-token amount aggregate. |
| Traces | Optional full-interval `callTracer` acquisition, bounded trees and deterministic transaction/path identities. Child calls inherit parent reverts. CREATE/CREATE2 output is kept separately. Function-call selectors without a block-valid implementation ABI remain explicitly undecoded. A provider denial makes all three trace tables unavailable, rather than returning a misleading empty result. |

Source links are also stored in records. Authoritative references include [QuickSwap deployments](https://docs.quickswap.exchange/overview/contracts-and-addresses), [Algebra V1 interfaces](https://github.com/cryptoalgebra/AlgebraV1), [Aave Polygon deployments](https://github.com/bgd-labs/aave-address-book/blob/main/src/AaveV3Polygon.sol), [Polymarket v2](https://github.com/Polymarket/ctf-exchange-v2), [Polymarket contracts](https://docs.polymarket.com/resources/contracts), [Sourcify API](https://docs.sourcify.dev/docs/api/), [Uniswap token list](https://github.com/Uniswap/default-token-list) and [chain registry](https://github.com/ethereum-lists/chains).

Publisher repository license texts are retained with attribution: [Uniswap GPL-3.0](licenses/uniswap-default-token-list.GPL-3.0.txt) and [chain registry MIT](licenses/ethereum-lists-chains.MIT.txt).

## Evidence and recovery

`.axis/bulk/<run>/enrichment/` retains immutable-input bindings, cached RPC/reference evidence and a derived manifest. Successful source reads are checkpointed and reused after interruptions. Reference bodies retain raw text and hashes; non-integer and oversized numeric lexemes remain strings. Offline verification replays every adapter against the staged logs and retained evidence, then compares exact rows, counts and coverage. It does not contact external services.

Enrichment fingerprints bind source and legacy decoder fingerprints, its own policy/ABI hash, retained evidence and derived rows. Long source identities use a SHA-256-derived queryable key with the original identity retained in the document to respect Arkiv's 128-byte string limit. The original protocol-stage decoder/hash is unchanged, preserving previously published imports.

Ratings use the full staged input interval stated in each rating/model document. Their input coverage can exceed the currently published raw-data prefix; it is not a claim that every underlying transaction has already been published to Arkiv.

Publication verifies records before advancing each complete block. Signer exclusivity covers individual batches and coverage commits, allowing other imports and the live worker to progress between transactions. Pending nonces stop new sends. The explorer only queries committed ordinals and checks counts against stored records. Table coverage prevents unsupported or omitted tables from appearing as genuine zero-row results. Three trace tables are currently blocked by the configured Polygon RPC's Free tier.

DuckDB/Parquet exports are local artifacts, with count and full-content readback plus file checksums. They are not Arkiv prefill files. Operator-assisted prefill permissions remain unestablished; the ordinary transaction publisher is much slower than offline seed generation in the Sourcify reference pipeline.
