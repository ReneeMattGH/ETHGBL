# Why we used Arkiv

AXIS should let someone share an analysis without asking the reader to trust a private dashboard database. Arkiv gives us a common place for the report definition, its source records and the evidence that describes the imported scope.

For example, the public report in [our proof](proof.json) is an eight-widget document owned by `0x4ef7b87c31ed098e5e128a27a3a772698ab8dd9b`. Its source records are published by a separate ingestion wallet. A reader can inspect both identities and query the same entities outside our interface.

## What users would lose if we moved this to Postgres

Postgres could store these tables and run the analytics. It could also support an application-level ownership model and retention jobs. The difference would be where those guarantees live and who a reader has to depend on.

With a private Postgres deployment, a user would need our API, an export or database access to recover their report definition and inspect its data. In AXIS, their report is an independently readable Arkiv entity. Another frontend can load its document and rerun its source query while those entities remain available. The [separate public viewer](../docs/dashboard-websites.md) already uses that separation.

Ownership also lives with the entity. Our web UI asks the owner's wallet to publish or update a dashboard, instead of treating a server-side user ID as ownership. Imported transfer, block and coverage records use Arkiv's readonly flag. We can extend their retention without patching their content. These choices are visible in a report's provenance and in who is allowed to edit it.

Expiry is part of the data contract. We chose a 30-day lifetime for definitions and analytical records and a shorter lifetime for job progress. We show expiry blocks and offer renewal rather than describing a saved report as permanent. When source records are missing or expire, coverage checks stop us from quietly showing a smaller number as a complete result.

Replacing Arkiv with Postgres would not make the charts impossible. It would move wallet ownership, read access and retention back behind an operator-controlled service. Those shared properties are the reason to use Arkiv here.

## What stays off Arkiv, and why

| Data | Where it stays | Reason |
| --- | --- | --- |
| Private keys, RPC credentials and OpenRouter credentials | Server/worker environment and deployment secret storage | They are credentials, not public analytical data. The website does not receive the worker signing key. |
| Pending jobs, signer locks, nonce recovery and staging checkpoints | The worker's local state directory | These coordinate one running worker. They are operational state; confirmed status and verified coverage are published separately. |
| Large raw extraction journals and DuckDB/Parquet staging | Local staging files | Extraction can produce much more than we choose to publish. The documented million-record extraction is staged data, not a claim that a million records were written to Arkiv. |
| Short-lived read caches and unsaved report drafts | Browser memory/session storage and local drafts | These make navigation faster or preserve unfinished work. They do not replace the published Arkiv definition or its provenance. |
| English query prompts and generated filter plans | The translation request and browser editor | OpenRouter helps produce an editable plan. It is not the source of the records or numbers. Source schemas are sent for translation; stored record payloads are not. |
| Optional archived CSV, JSON and HTML files | Swarm | Larger report files belong in content-addressed file storage. Arkiv holds their reference, checksum and source description. [Swarm evidence and its limits](swarm.md). |

## What Arkiv does not prove for us

An owned, readonly record proves which wallet published that record; it does not prove that our Polygon provider told the truth or that the imported interval covers all history. AXIS still trusts its configured ingestion publisher and checks source block continuity, content readback and coverage counts. We show the source bounds instead of calling every result complete blockchain data.

The hosted API is also a service operated by us. Independent access to Arkiv makes replacement readers possible; it does not make our current frontend, worker or upstream providers decentralized. We think that is a useful, honest boundary for this app.

Implementation: [wallet-owned definitions](../src/components/axis/wallet.tsx), [verified reads](../src/lib/axis/store.ts), [readonly publication](../src/lib/axis/ingestor.ts), [bulk committed-prefix reads](../src/lib/axis/bulk/published-store.ts).
