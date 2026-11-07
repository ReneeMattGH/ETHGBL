# AXIS — Arkiv Query & Dashboard Studio

AXIS turns verified onchain records into reports you can own and share. Pick a dataset, build filters or ask in English, inspect the returned table, and turn that query into an interactive dashboard. The records, source coverage, dataset definitions and published dashboards live in Arkiv.

Built for **ETHGlobal Mumbai — Build on Arkiv (from scratch)**. The first recorded project commit is [c1545f7](https://github.com/ReneeMattGH/ETHGBL/commit/c1545f79b0a15d029fa09e32e9ad1f5138fef062), dated 6 November 2026. We used existing open-source libraries and public source data; [AI_DISCLOSURE.md](AI_DISCLOSURE.md) explains the development assistance and the runtime English-query feature.

[Open AXIS](https://axis-platform-e7ac45525b.vercel.app) · [Open a public dashboard](https://axis-reports-e7ac45525b.vercel.app/d/0xcb7fccae9b8fd715ce0a465687b0e189efb324ce83d07bfd95b781e2902e40c6) · [Source repository](https://github.com/ReneeMattGH/ETHGBL)

Viewing the report does not require a wallet. Publishing or editing a definition requires its owner's Rabdi wallet. The current Query Studio and saved-report workflow focus on Polygon USDC; the explorer also reads scoped protocol and reference collections. We do not claim complete chain history. The product uses real Arkiv reads; automated tests also contain controlled fixtures.

## For Arkiv judges

| What to review | File |
| --- | --- |
| Entities, query fields, ownership and expiry | [arkiv/schema.md](arkiv/schema.md) |
| What got in our way and how to reproduce it | [arkiv/friction.md](arkiv/friction.md) |
| Who it is for, the public demo and next steps | [arkiv/reach.md](arkiv/reach.md) |
| What users gain from Arkiv and what stays elsewhere | [arkiv/why-arkiv.md](arkiv/why-arkiv.md) |
| The read/write flow and visible use of Arkiv features | [arkiv/how-you-use-arkiv.md](arkiv/how-you-use-arkiv.md) |
| Dated live entity, owner, expiry and coverage evidence | [arkiv/proof.json](arkiv/proof.json) |
| Arkiv + Swarm bonus: archive links, code, reproduction and remaining proof | [arkiv/swarm.md](arkiv/swarm.md) |

The public frontend, API health check and report page returned HTTP 200 on 7 November 2026. The report's real Arkiv definition contains eight widgets. A separate live coverage check at 02:18:54 UTC found 8,726 verified transfers in its stated source range, with no coverage gaps. These are dated observations, not fixed future counts. [Reach and demo details](arkiv/reach.md).

### Wallets that wrote the example entities

| Wallet | What it wrote |
| --- | --- |
| `0x4ef7b87c31ed098e5e128a27a3a772698ab8dd9b` | The example dataset and public dashboard definitions. Their owner and creator were both this wallet in our live read. |
| `0xe7ac45525bd9fec84902371aaa65cf53c7d89909` | Ingested source records and coverage; also the separately documented Swarm snapshot descriptor. A live transfer read confirmed this owner and creator. |

Storage network: **Arkiv Rabdi, chain 7794095**. Source data network: **Polygon, chain 137**. [Current Arkiv network information](https://docs.arkiv.network/).

### One query you can run

This native Arkiv predicate returned the published report at block **316081**:

```sql
arkiv.schema = str('axis.dashboard.v1')
AND $owner = addr(0x4ef7b87c31ed098e5e128a27a3a772698ab8dd9b)
AND published = true
AND $key = key(0xcb7fccae9b8fd715ce0a465687b0e189efb324ce83d07bfd95b781e2902e40c6)
```

Run it directly through JSON-RPC from PowerShell. Set the process environment variable `ARKIV_ACCESS_KEY` if you have a key; otherwise this uses the public endpoint, which may rate-limit requests. This does not use the AXIS API.

```powershell
$axisRpc = 'https://rpc.rabdi.db-chain.testnet.arkiv.network'
if ($env:ARKIV_ACCESS_KEY) { $axisRpc += '/' + [uri]::EscapeDataString($env:ARKIV_ACCESS_KEY) }
$axisPredicate = @'
arkiv.schema = str('axis.dashboard.v1') AND $owner = addr(0x4ef7b87c31ed098e5e128a27a3a772698ab8dd9b) AND published = true AND $key = key(0xcb7fccae9b8fd715ce0a465687b0e189efb324ce83d07bfd95b781e2902e40c6)
'@
$axisRequest = @{
  jsonrpc = '2.0'
  id = 1
  method = 'arkiv_query'
  params = @($axisPredicate, @{ select = @{ key = $true; owner = $true; expiresAt = $true; attributes = $true; count = $true }; limit = '0x1' })
} | ConvertTo-Json -Depth 8
Invoke-RestMethod -Uri $axisRpc -Method Post -ContentType 'application/json' -Body $axisRequest
```

Expected at the recorded check: one entity owned by the definition wallet above, an expiry block, and a document containing the eight-widget report. Entities can later change or expire. The [proof file](arkiv/proof.json) includes a source record key and coverage bounds for independent inspection.

## Implementation notes

- [Dashboard websites](docs/dashboard-websites.md): a separate viewer serves published reports at `/d/<entity-key>`.
- [Deployment](docs/deployment.md): Vercel frontend/viewer and a persistent API/worker host. Running the app locally and verifying a public deployment are separate checks.
- [Bulk publication](docs/bulk-publication.md), [ingestion commands](docs/bulk-ingestion.md) and [curated coverage](docs/curated-ingestion.md): staged extraction, verified publication and unavailable provider features are recorded separately.
- [Arkiv + Swarm](arkiv/swarm.md): a real 1,007-row archive and its evidence. Actual gateway postage batch/buyer/retention and complete bonus proof remain unresolved; this is not a claim that the bonus is already qualified.

## Stack

- Next.js 16 (App Router, Turbopack)
- React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui (radix-nova)
- Recharts
- `@arkiv-network/sdk` 1.0.1 + viem

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

Production build:

```bash
npm run build
npm start
```

## Arkiv configuration

The current workspace integration is in `src/lib/axis/`; lower-level query helpers also remain in `src/lib/arkiv/`. Read credentials stay server-side. The worker signing key belongs only in ignored `.env.worker.local`, not in the website configuration.

For a fresh checkout, copy `.env.example` to `.env.local` and set the read configuration below. The dedicated indexer address is public; its private key is not needed to read reports.

```bash
ARKIV_ACCESS_KEY=your_key_here
AXIS_INDEXER_ADDRESS=0xe7ac45525bd9fec84902371aaa65cf53c7d89909
# Optional: defaults to https://rpc.rabdi.db-chain.testnet.arkiv.network
ARKIV_RPC_URL=
ARKIV_QUERY_TIMEOUT_MS=15000
```

- Get an access key at <https://hub.arkiv.network/access-keys>.
- Without a key the app still works against the public RPC, but that endpoint is heavily rate-limited. The UI shows a "Public RPC" badge and an explicit warning rather than pretending the connection is dedicated.
- `ARKIV_RPC_URL` overrides the SDK's default Rabdi endpoint. The access key is appended as the final URL path segment, and only the host is ever reported to the browser.
- `ARKIV_QUERY_TIMEOUT_MS` is clamped to `3000–60000` ms.
- Never prefix the key with `NEXT_PUBLIC_`. No secrets are stored in `localStorage` or sent through dashboard configurations.
- A misconfigured `ARKIV_RPC_URL` surfaces as a `CONFIG` error in the connection panel instead of silently falling back.

Only **Rabdi Testnet** (chain ID 7794095, tGLM) is offered. The SDK also exports a localhost chain, but a local node is unreachable from the hosted server, so it is intentionally omitted.

## English queries with OpenRouter

Query Studio offers **Manual query** and **Ask in English** for the selected user datasets. Add these server-only settings to `.env.local` and restart the development server:

```dotenv
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=google/gemini-2.5-flash
```

Choose a model that supports [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs). The server sends the request and selected dataset schemas, without stored record payloads. It validates the typed plan, converts USDC amounts using exact base units, and compiles the native query with the existing trusted-owner and verified-coverage restrictions. Missing credentials leave manual querying available.

The main workflow is **select datasets → describe records → Execute query**. This generates and validates the filters, executes the Arkiv read, and reveals the Run query panel with the executed predicate and resulting table. **Generate query** previews without executing; **Run query** runs that prepared plan. **Edit manually** moves the generated filters into the manual controls. Both modes share result pagination, complete-result CSV export, dashboard creation and saving results as a dataset. Multiple sources retain their own filters and combine with OR. Unsupported operations and ambiguous requests ask for clarification; arbitrary SQL, joins, aggregations and amount-based sorting are not translated into executable queries.

`GET /api/axis/query-assistant` reports availability; `POST /api/axis/query-assistant` generates a reviewed plan without executing it. Requests are bounded to 2,000 characters, 20 selected sources, two simultaneous generations, 20 generations per minute per server process and a 45-second provider timeout. An expired or changed source is checked again through the ordinary query endpoint when Run query is clicked.

## Browser read caching

Dataset lists, definitions, schemas, catalog previews, chart analytics and dashboard results reuse successful reads in memory and in the current tab's session storage. Revisiting a view or reloading the tab renders the saved data immediately. Copies are fresh for 30 seconds (or the view's shorter polling interval); older copies refresh in the background, and copies older than five minutes are discarded on reuse. The original Arkiv read timestamps and exact values are retained. First visits still require the network.

Refresh buttons and explicit Query Studio execution always request fresh data. Successful dataset/dashboard writes, renewals and deletions invalidate browser reads. Keys include the API namespace, owner, source datasets/imports, filters and pagination to prevent results crossing scopes. A failed background refresh keeps the last successful visuals with an error notice. The cache is bounded to 80 entries and approximately 3 MB of browser storage; unavailable storage falls back to memory. Configuration, wallet challenges, RPC, worker status, English translations, exports and mutations are never persisted. Existing API response headers remain `no-store`.

## Arkiv read performance

The server reuses its configured SDK reader, coalesces identical in-flight reads, and limits node work to eight concurrent queries per process with a bounded queue. Independent coverage/alert reads run together. Count-only checks return no entity payload, schema probes return only the key and field schema, and transfer reads request only fields used by tables, provenance and exact analytics. Scan pages do not recalculate counts.

Large analytics/export scans use four disjoint ranges of entity keys with cursor pagination inside each range. Small responses need one page. Ranges retain the entire trusted-owner/source/filter predicate, return results in key order, and share the existing 20,000-row cap. Any range failure rejects the complete result. The final fresh count and verified coverage checks still run; completed raw reads are not reused by the server as a replacement for those checks. Arkiv reads the latest block on each call, so this does not claim a database snapshot across pages.

Run a read-only live benchmark with `npx.cmd tsx scripts/axis-read-benchmark.ts <dataset-key>`. Add `--verify` to compare all aggregates against another fresh sequential scan of the same frozen predicate. It reports timings, RPC calls, decoded response characters and parallelism without printing credentials or RPC endpoints. On one 7,380-transfer live scope, analytics fell from 51.4 seconds to 20.9 seconds and decoded response text from 21.4 million to 9.5 million characters. These are observed local measurements; network latency and source size affect subsequent runs.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Product landing page |
| `/overview` | Workspace, public dashboards and the connected wallet's datasets |
| `/explore` | Curated collections, scoped charts, previews and provenance |
| `/query` | Manual/English filters, returned tables, exports and save-as-dataset |
| `/datasets` | The connected wallet's dataset library |
| `/datasets/[id]` | Verified source coverage, transfers and owner controls |
| `/dashboards` | Published report library; cards open the editor |
| `/dashboards/new`, `/dashboards/[id]/edit` | Report builder; existing-definition edits require its owner |
| `/dashboards/[id]` | Public report with filters and refresh |
| `/snapshots` | Arkiv-published references to optional Swarm archives |
| `/ingestion`, `/settings` | Import monitoring and connection settings |
| `/api/axis/*` | Server-side workspace reads, query translation and authorized operations |
| `/api/reports/[id]/*` | Public-viewer reads limited to that report's sources |

## How real Arkiv access works

- Queries execute through `runQuery(client, { query, select, limit, offset, count })` from `@arkiv-network/sdk/query`.
- The query language is the node's own predicate syntax (`str('v')`, `u64(1)`, `key(0x…)`, `BETWEEN`, `STARTSWITH`, `ORDER BY $expiresAt:u64 DESC`, …). Invalid predicates surface the node's structured error kind and position.
- Pages are capped at 100 rows by the node; the UI reports both the page rows and the node-reported total count.
- `$createdAt` / `$updatedAt` / `$expiresAt` are **block numbers**, not wall-clock timestamps. The UI labels them as blocks.
- Scope/sequence guards prevent late responses from replacing a newer query. Shared read requests can finish for other consumers; English-generation requests use cancellation as well.
- Access keys and RPC URLs are redacted from error details before they reach the client.
- Numeric parsing respects the Arkiv type tag: integers outside the safe JS range are rejected rather than rounded, unsigned types reject negative values, and a field observed with conflicting types is marked `mixed` and never charted as a number.

## Testing

```powershell
npm.cmd run typecheck
npm.cmd run test:unit -- --maxWorkers=2
npm.cmd run test:live
```

`test:live` calls the real `/api/arkiv/status` and `/api/arkiv/query` routes and asserts connection, block metadata, real entities, stable key pagination, zero-result success, invalid-query rejection, refresh re-execution and validation. It exits non-zero and prints the actual failure when the node is unreachable or rate-limited; it never substitutes fabricated results.

## Persistence and live refresh

Published datasets and reports are wallet-owned Arkiv entities. Dashboard documents store queries, chart settings and layouts; their source records and verified coverage also live in Arkiv. Browser state holds unfinished drafts, preferences and bounded read caches. It is not the authoritative published report database.

Report polling uses chained timers, with manual refresh and last-read metadata. Full-scope analytics scan the matching verified records up to the 20,000-row cap; this is separate from a paginated table. Missing records, coverage mismatches and oversized scopes fail explicitly. Definitions and worker records start with 30-day lifetimes; job progress uses seven days. Renewal must be run to keep entities available. See [schema and retention](arkiv/schema.md).

## Code map

- `src/components/axis/`: workspace, dataset library, Query Studio, builder and analytical charts.
- `src/lib/axis/`: schemas, verified store reads, ingestion, query validation and source adapters.
- `src/lib/axis/bulk/`: extraction, reference/protocol enrichment and verified publication.
- `src/lib/arkiv/`: additional query-language and lower-level reader utilities.
- `scripts/`: workers, live checks, benchmarking and deployment helpers.
- `arkiv/`: judging documents and public proof.

## License and AI disclosure

AXIS code is available under the [MIT license](LICENSE). Third-party dependencies and imported reference data retain their own licenses; source notices are preserved in [docs/licenses](docs/licenses) and described in [curated ingestion](docs/curated-ingestion.md).

We used OpenAI Codex for development and documentation assistance. The product's English-to-filter feature uses OpenRouter at runtime. [AI_DISCLOSURE.md](AI_DISCLOSURE.md) explains both uses.
