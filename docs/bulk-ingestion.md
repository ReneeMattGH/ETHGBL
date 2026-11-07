# Bulk ingestion commands

Run from `E:\ETHGBL` in PowerShell. Install dependencies with `npm.cmd install`. The CLI loads ignored `.env.local` using Next.js environment-loading rules. Extraction/decoding never load `.env.worker.local`; the `publish` command loads it for the dedicated configured signer. Polygon source access requires `POLYGON_RPC_URL`. Arkiv probes and publication use the existing Arkiv configuration and public writer address.

## Probe the configured infrastructure

```powershell
Set-Location E:\ETHGBL
npm.cmd run bulk -- capabilities --block 96852708 --traces
```

This requests one historical sample and optionally one trace. Results are written to `.axis/bulk/capabilities.json`. Unsupported trace capability is recorded separately; raw ingestion can still proceed. A successful historical sample does not prove unlimited archive coverage or an RPC range/rate limit. Probes do not establish bulk prefill access or submit transactions.

## Extract a small finalized window

```powershell
npm.cmd run bulk -- extract --run polygon-pilot --blocks 5 --tokens examples/bulk-tokens.json
npm.cmd run bulk -- verify --run polygon-pilot
npm.cmd run bulk -- parquet --run polygon-pilot
npm.cmd run bulk -- decode --run polygon-pilot
npm.cmd run bulk -- verify-protocols --run polygon-pilot
npm.cmd run bulk -- protocol-parquet --run polygon-pilot
npm.cmd run bulk -- source-check --run polygon-pilot
```

The first command fixes its ending block to the currently finalized boundary, stages every transaction/receipt/raw log in that interval, and decodes transfers only for the selected tokens. `examples/bulk-tokens.json` selects native USDC and wrapped POL (the WMATIC-address deployment listed in [Uniswap's Polygon deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-polygon-deployments)). Additional tokens can be added with an address, explicit `stablecoin` boolean and optional `expectedDecimals`. Token name/symbol must implement standard ERC-20 string returns; incompatible metadata fails explicitly. Mixed tokens are never combined into a monetary total.

`decode` reads the verified local raw logs and checks historical membership calls before decoding QuickSwap V2 / Uniswap v3 pool events and five Aave v3 Pool actions. It does not download the raw history again. Its pool tables cover observed active pools only. QuickSwap Algebra, position-manager joins, Aave reserve snapshots and Polymarket are not included. Aave provider/pool mapping is checked even for an interval with no actions. A failed RPC enrichment leaves a resumable protocol checkpoint; `verify-protocols` and repeat exports work offline.

`source-check` is an optional online cross-check: re-fetch source headers and all logs per block using `eth_getLogs`, compare with stored receipt logs, and re-decode selected-token transfers. It consumes extra provider requests. This is a check using different methods of the same provider, not an independent provider or receipt proof.

To use the same fixed range as the regression pilot:

```powershell
npm.cmd run bulk -- extract --run polygon-pilot-fixed --from 96852708 --to 96852712 --tokens examples/bulk-tokens.json
```

For an explicit complete configuration, use `--config FILE` containing:

```json
{
  "version": 1,
  "chainId": 137,
  "fromBlock": "96852708",
  "toBlock": "96852712",
  "tokens": [
    { "address": "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", "stablecoin": true, "expectedDecimals": 6 }
  ],
  "concurrency": 2
}
```

`--config` cannot be mixed with extraction flags. Decimal block boundaries must be strings. Each run is fixed to its original config hash; use a new run ID to change the range or contract selection. Maximum 100 token contracts and read concurrency 1–8. A large allowed range is not a recommendation to run it without sizing.

## Resume an interrupted extraction

```powershell
npm.cmd run bulk -- extract --run polygon-pilot
```

Existing configuration is reused. Committed local parts are verified and the last source hash is checked before continuing. Incomplete blocks do not advance the checkpoint. A completed run performs verification and source boundary checks without fetching its receipts again. If the process was killed, inspect `extract.lock` and confirm its PID is no longer running before removing that particular lock file.

## Files and query examples

```text
.axis/bulk/<run>/
  manifest.json            configuration, metadata, committed parts and scope
  parts/*.ndjson           canonical source/derived records and content hashes
  extraction-report.json   extraction counters and elapsed time
  stage.duckdb             local analytical records table after export
  parquet/*.parquet        six tables, ZSTD compressed
  parquet/manifest.json    verified row counts and local-only publication state
  protocols/manifest.json  decoder/source fingerprints and factory/provider call evidence
  protocols/parts/*       recoverable decoded protocol records
  protocols/stage.duckdb   derived protocol records database
  protocols/parquet/*     eleven protocol tables, including genuine zero-row tables
  source-check.json       optional online cross-check report
```

The DuckDB `records` table has `tableId`, `sourceId`, `blockNumber`, `blockHash`, `timestamp`, `contract`, `txHash`, lossless JSON `payload`, envelope `version` and `contentHash`.

```sql
SELECT tableId, count(*) FROM records GROUP BY tableId;

SELECT contract,
       json_extract_string(payload, '$.symbol') AS symbol,
       count(*) AS transfers
FROM records
WHERE tableId = 'token-transfers'
GROUP BY contract, symbol;

-- Keep amounts as strings until choosing a numeric representation wide enough for the operation.
SELECT sourceId, json_extract_string(payload, '$.amountRaw') AS amount_raw
FROM records
WHERE tableId = 'token-transfers';
```

Extraction, decoding and Parquet export do not publish records. Publication is a separate command described below. Parquet manifests include SHA-256 and byte size for each file; export verifies every row against its DuckDB source, not just totals. Exports rebuild derived DuckDB files so an incompatible old database cannot block recovery from the journal. See [the implementation plan](../ingestion-plan.md) for reference imports and the remaining protocol work, and [the capability/pilot report](ingestion-capabilities.md) for measured live evidence.

## Publish verified data into Arkiv

```powershell
npm.cmd run bulk -- publish --run polygon-pilot --max-spend 0.5 --batch-size 24
```

This writes real entities on Rabdi testnet using the configured `.env.worker.local` signer. It requires completed, verified raw and protocol stages. Entities are retained for 30 days. Imports and records use the separate `axis.bulk.import.v1` and `axis.bulk.record.v1` schemas; legacy wallet dataset definitions and USDC analytics remain separate.

Publication batches are bounded by a conservative calldata estimate and at most 64 records (24 by default). The SDK estimates transaction gas. `--max-spend` is a tGLM checkpoint budget checked between batches; the last batch can cross it. Definition creation and earlier uncertain writes can incur additional fees. It is not a strict transaction fee cap. Remaining writer balance is checked before each batch. A stopped budget preserves the source and partial writes; rerun with a higher budget to continue.

A shared `signer` lock serializes the bulk publisher and the live worker's transactions. Source fetching/verification does not hold the live worker's signer. Publication retains nonce intent before sends, reconciles existing source identities before retrying, verifies complete row contents and duplicates, and advances an import's coverage only after the entire block is stored and read back. In-flight rows are excluded from explorer queries. A query count that differs from its manifest fails rather than showing an expired/partial total.

The Data Explorer has a **Data source** selector for verified bulk imports. Bulk protocol tables use the published native Arkiv query and source scope in Provenance. The **Ingestion Monitor** shows staged source rows separately from verified Arkiv rows. Missing and unsupported adapters remain unavailable.

## Run the extraction-to-publication job

Start a new bounded run, or resume an existing run without repeating its range:

```powershell
npm.cmd run bulk:job -- --run polygon-backfill --blocks 1000 --tokens examples/bulk-tokens.json --max-spend 1
npm.cmd run bulk:job -- --run polygon-backfill --max-spend 1
```

The job resumes `extract`, `decode`, then `publish`. Transient failures back off and retry; deterministic integrity errors and reached budgets stop with explicit status. The source RPC is paced at 750 ms between requests by default; set `AXIS_BULK_RPC_INTERVAL_MS` to a different interval in `.env.local` before starting the job. Extraction failures retain committed block parts. Logs are ordinary stdout/stderr; background launches in this workspace redirect them under `.axis/bulk-jobs/`.

Local job state is available at `/api/axis/bulk/jobs`; published import manifests come directly from Arkiv at `/api/axis/bulk/imports`. These are separate states. A job in extraction can contain many staged rows while its published count is still zero.

## Test the foundation

```powershell
npm.cmd run test:unit -- src/lib/axis/bulk
npm.cmd run typecheck
```

Parquet tests exercise the actual native DuckDB library and real temporary files with synthetic RPC fixtures. Live Polygon evidence is separate in the checked capability report and local pilot reports. Local staging files may be large and are gitignored.
