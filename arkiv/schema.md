# What AXIS stores in Arkiv

AXIS stores the things another reader needs to reproduce a report: its definition, the records it queries, and the coverage that says which source blocks were verified. A dashboard is an Arkiv entity, not a row hidden in our web server's database.

We use Rabdi, chain ID **7794095**, through `@arkiv-network/sdk` 1.0.1. The Polygon records describe chain **137**; those two chain IDs serve different purposes. [Current network details](https://docs.arkiv.network/).

## Entities, owners and lifetimes

Every entity also has Arkiv's system fields, including `$key`, `$owner` and `$expiresAt`. The expiry is a block number. Our code asks the SDK for a 30-day lifetime unless noted below; it is not a permanent-storage promise.

| Schema | What it contains and how we query it | Who owns it / can change it | Initial lifetime |
| --- | --- | --- | --- |
| `axis.dataset.v1` | Dataset name, Polygon contract, writer, source bounds and a document describing the scope. Looked up by `$key`; wallet libraries filter `$owner` and trusted `writer`. Indexed columns: `name`, `chainId`, `contract`, `writer`, `startBlock`, `enabled`, `continuous`. | The wallet that creates the definition. The owner can change enabled state, renew it or delete it. Saving a query result creates a new definition with frozen source ranges and filters. | 30 days |
| `axis.dashboard.v1` | Title, published flag, source time and the complete report document: source queries, widget configuration and layout. The library queries `published = true`; a report loads by `$key`. Indexed: `title`, `published`, `sourceTime`. | The user's wallet. Editing and publishing an existing report requires that owner. Public viewers can adjust their own filters without changing the saved report. | 30 days |
| `axis.transfer.v1` | Exact USDC transfer records. Queries constrain `datasetKey`, verified `blockNumber` bounds and optional `sender`, `recipient`, `sourceTime`, `amountRaw` or `txHash`. Those columns are indexed, along with `sourceId`, `chainId` and `contract`. | The ingestion wallet. Created with `readonly: true` and `permissionlessExtension: true`; the data cannot be patched after publication. | 30 days |
| `axis.block.v1` | Source block number, hash and time. Queried by trusted owner, `datasetKey` and source block bounds. Indexed: `datasetKey`, `sourceId`, `blockNumber`, `chainId`. | Ingestion wallet; readonly attributes, permissionless retention extension. | 30 days |
| `axis.coverage.v1` | Verified block intervals, row counts, content hashes and readback evidence. Queried by `datasetKey` and `verified = true`, then checked for gaps and overlaps. Indexed: `datasetKey`, `fromBlock`, `toBlock`, `verified`. | Ingestion wallet; readonly attributes, permissionless retention extension. | 30 days |
| `axis.coverage_alert.v1` | A source-consistency failure and its reason. Queried by `datasetKey`; a matching alert prevents normal analytics over that source. Indexed: `datasetKey`. | Ingestion wallet; readonly attributes, permissionless retention extension. | 30 days |
| `axis.contract.v1` | Token contract metadata used by the catalog. Indexed: `chainId`, `contract`. Symbol and decimals are stored values, not indexed search fields. | Ingestion wallet; readonly attributes, permissionless retention extension. | 30 days |
| `axis.daily_metric.v1` | Exact counts and amounts for an observed import interval. Indexed: `datasetKey`, `fromBlock`, `toBlock`. These are interval summaries, not a claim to cover an entire calendar day. Current report analytics are calculated from the source records. | Ingestion wallet; readonly attributes, permissionless retention extension. | 30 days |
| `axis.ingestion_status.v1` | Import job ID, stage and progress document. The monitor combines published history with the worker's current local state. Indexed: `datasetKey`, `jobId`, `stage`. | Ingestion wallet. The same status entity is patched as a job progresses. | 7 days |
| `axis.saved_query.v1` | A reusable query document and title. Indexed: `title`, `datasetKey`. A publishing helper exists; the main UI currently saves queried scopes as datasets instead. | Publishing user's wallet. No live saved-query example is claimed in the proof file. | 30 days |
| `axis.bulk.import.v1` | Import configuration and decoder fingerprints, selected tables, counts, availability and the committed source prefix. Queried by trusted owner, `$key` or `importHash`. Indexed: `importHash`, `chainId`, `status`. | Ingestion wallet. The manifest changes as complete, verified blocks are committed. | 30 days |
| `axis.bulk.record.v1` | A lossless source/protocol/reference document with a compact queryable envelope. Queries use `importKey`, `tableId`, `ordinal`, `blockNumber` and optional `contract`, `txHash` or `stablecoin`. `sourceId` is also indexed. | Ingestion wallet; readonly attributes, permissionless retention extension. | 30 days |
| `axis.snapshot.v1` | A public Swarm reference, manifest checksum and the source scope for an archived query result. Indexed: `title`, `swarmReference`, `chainId`, `sourceTime`. | Publishing wallet. The descriptor uses the SDK's default mutable permissions; we do not claim it has the readonly flag. The archived files are checked against their content hashes. | 30 days |

Definitions: [main schemas](../src/lib/axis/schemas.ts), [bulk schemas](../src/lib/axis/bulk/publication-schemas.ts), [snapshot schema](../src/lib/axis/swarm-schema.ts). Writes: [wallet publishing](../src/components/axis/wallet.tsx), [live ingestion](../src/lib/axis/ingestor.ts), [bulk publication](../src/lib/axis/bulk/arkiv-publication.ts).

## Why expiry changes the product

Thirty days is our current choice for a working analytics window and its report definitions. It is configurable in code, not a retention picker in the UI. Owners can renew their definitions. The worker's renewal command extends its data entities that are approaching expiry; that command has to run for retention to continue. Published job history gets a shorter seven-day lifetime because old progress is less useful than the records themselves.

When underlying rows disappear, we compare the live count with the coverage manifest and stop calculating a supposedly complete total. A saved result dataset also checks that its original row count is still available. A public report URL does not keep either its definition or source records alive. We have tested missing/expired-record handling, but have not documented a live wait-through-expiry experiment.

The permissionless extension flag on immutable worker records lets another party pay to retain them without gaining permission to edit their attributes. Our renewal path still uses the worker wallet. [Renewal implementation](../src/lib/axis/renew.ts), [coverage failure tests](../src/lib/axis/coverage.test.ts).

## A concrete read

```sql
arkiv.schema = str('axis.dashboard.v1')
AND $owner = addr(0x4ef7b87c31ed098e5e128a27a3a772698ab8dd9b)
AND published = true
AND $key = key(0xcb7fccae9b8fd715ce0a465687b0e189efb324ce83d07bfd95b781e2902e40c6)
```

This returned one real entity at Arkiv block **316081**. Its document has eight widgets and points to the dataset in [proof.json](proof.json). These are dated observations; records can later be updated, deleted or expire.
