# How Arkiv shows up in AXIS

The main flow is **query records → inspect the table → save the scope → build a report → share it**. Arkiv is involved in both the saved definition and the data that makes the report useful.

## From source records to a chart

1. The ingestion worker reads a finalized Polygon interval and normalizes its USDC transfers into exact integer base units. It writes transfers and source blocks with the Arkiv SDK.
2. It reads those writes back. Only after the interval passes verification does it publish coverage. A bulk import similarly exposes only its committed, verified source prefix.
3. Query Studio loads dataset definitions and the field schema from Arkiv. Its filters follow the selected dataset. A combined query keeps each source's owner, source key, verified bounds and filters inside its own OR branch.
4. A table request returns a page plus the node's count. Analytics and complete exports scan the selected scope, subject to the 20,000-row safety limit. We preserve exact token values and check counts before presenting a full result.
5. Saving a queried result creates a wallet-owned dataset definition with frozen source bounds and filters. It reuses the underlying records; it does not copy a table into a private database or keep importing unrelated new transfers into that saved scope.
6. A published dashboard stores its queries, widget choices, titles, layout and refresh interval in an Arkiv document. The public viewer loads that definition and queries its permitted source datasets again.

Read path: [store.ts](../src/lib/axis/store.ts). Write paths: [wallet.tsx](../src/components/axis/wallet.tsx), [ingestor.ts](../src/lib/axis/ingestor.ts), [bulk publisher](../src/lib/axis/bulk/arkiv-publication.ts).

## Features users can actually see

| Arkiv feature | Choice in AXIS | What changes for the user |
| --- | --- | --- |
| Typed, indexed filters | Dataset key, source block, wallet address, timestamp and raw USDC amount filters | The table and report read the requested scope from Arkiv. English input produces those same reviewed filters; it cannot invent SQL joins or arbitrary data. |
| Entity ownership | Users own definitions; a separate ingestion wallet owns the records it publishes | A connected owner can edit or renew their report. Other visitors can read it and change their own view without rewriting it. |
| Readonly attributes | Worker transfer, block, coverage and bulk-record entities are created readonly | Published record content is not patched later. Corrections require a new verified revision rather than silently replacing a value behind a chart. |
| Chosen expiry | 30 days for analytical records/definitions; 7 days for job status | Reports have an explicit lifetime. Definitions can be renewed, and missing source data causes a coverage warning/error instead of a misleading total. |
| Public query access | Report definitions and source entities can be read outside AXIS | A public report works in a separate viewer. A judge can run the query below without using our UI. |
| Batches and readback | Records are written in batches, reconciled and then covered by a manifest | The explorer does not expose a partially published next source block as a completed import. |

The full [schema inventory](schema.md) distinguishes indexed fields from values that we aggregate after reading. We keep arbitrary JSON in documents when it is useful for provenance, and put stable scope/filter fields in typed columns.

## Run the same read yourself

This is the exact native predicate we verified against Rabdi. It returned one dashboard at block **316081**:

```sql
arkiv.schema = str('axis.dashboard.v1')
AND $owner = addr(0x4ef7b87c31ed098e5e128a27a3a772698ab8dd9b)
AND published = true
AND $key = key(0xcb7fccae9b8fd715ce0a465687b0e189efb324ce83d07bfd95b781e2902e40c6)
```

For the SDK/RPC invocation, see the [README](../README.md#one-query-you-can-run). For public entity keys, owner addresses, expiry blocks and dated coverage, see [proof.json](proof.json). Open the [actual report](https://axis-reports-e7ac45525b.vercel.app/d/0xcb7fccae9b8fd715ce0a465687b0e189efb324ce83d07bfd95b781e2902e40c6) to see the result used by a user-facing feature.

## The limits we kept visible

Rabdi stores the data; we still run the reader API and ingestion worker. The saved-dashboard workflow is currently USDC-focused. Curated protocol collections use explicitly scoped imports, and unavailable source tables stay unavailable. Complete analytical queries fail above the row cap rather than silently sampling a whole-dataset total.

Browser caches preserve the last successful view during refresh, with errors if refresh fails. Explicit query execution still makes a fresh server read. Our server shares simultaneous identical RPC requests but does not substitute a completed raw read for a new coverage/count check. Multi-page reads are not a block-pinned snapshot.

A report definition can outlive its source records, and renewal is an operation that must be run, not an automatic promise. The [expiry tests](../src/lib/axis/coverage.test.ts) check missing-data behavior; our proof does not claim a live observation of the entities expiring. The optional [Swarm publication](swarm.md) has separate retention and postage limits.
