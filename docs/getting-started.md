# Run AXIS locally

Use Node.js 24 (the version used for our local validation), npm, an Arkiv access key and the public ingestion address. A publisher needs a browser wallet with Rabdi testnet funds; read-only use does not need the ingestion private key.

## Install and start

From a fresh checkout on Windows:

```powershell
npm.cmd ci
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

Set these values in `.env.local`:

```dotenv
ARKIV_ACCESS_KEY=your_arkiv_access_key
AXIS_INDEXER_ADDRESS=0xe7ac45525bd9fec84902371aaa65cf53c7d89909
```

Then start the workspace:

```powershell
npm.cmd run dev
```

Open [localhost:3000](http://localhost:3000). Get a key from the [Arkiv Hub](https://hub.arkiv.network/access-keys). Keep it server-side; never use a `NEXT_PUBLIC_` prefix. The configured source address above is public and does not grant signing access to that wallet.

## Arkiv connection

AXIS currently uses Rabdi, chain ID 7794095. Polygon source records describe chain 137. Main workspace reads live in `src/lib/axis/`; lower-level query-language helpers remain in `src/lib/arkiv/`.

| Setting | Purpose |
| --- | --- |
| `ARKIV_ACCESS_KEY` | Server-side access to the Arkiv RPC |
| `AXIS_INDEXER_ADDRESS` | Trusted publisher whose imported records the app reads |
| `ARKIV_RPC_URL` | Optional endpoint override; the access key is appended as the final path segment |
| `ARKIV_QUERY_TIMEOUT_MS` | Timeout for the lower-level reader; clamped to 3,000–60,000 ms |

The current AXIS SDK reader has a 20-second timeout per RPC attempt and bounded retries. Its setting is separate from the lower-level reader's timeout. Public RPC access may be rate-limited. Invalid configuration and unavailable source data surface as errors rather than sample results.

## Ask in English

Manual filters work without an AI provider. For the English mode, add server-only OpenRouter configuration:

```dotenv
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=google/gemini-2.5-flash
```

Restart the dev server after changing the environment. Choose a model that supports [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).

The flow is **select datasets → describe records → Execute query**. This generates and validates filters, reads Arkiv and reveals the executed predicate with its result table. **Generate query** previews a plan without executing. **Run query** executes that prepared plan, and **Edit manually** moves it into the manual controls.

The request sends a prompt and selected schemas, without stored record payloads. Validation preserves source identities, verified block bounds and exact token base units. Combined sources retain their own filters inside OR branches. Unsupported joins, arbitrary SQL, aggregations and amount sorting are not translated into executable queries.

Requests are bounded to 2,000 prompt characters, 20 sources, two simultaneous generations, 20 generations per minute per server process and a 45-second provider timeout. Query execution checks current coverage again. [Implementation](../src/lib/axis/english-query-service.ts).

## Worker and uploads

Viewing existing data does not require a local writer. To ingest or publish, configure your own authorized signer in ignored `.env.worker.local`. Never put that private key in the website environment or share the example publisher's key. The worker must match the indexer assigned to its datasets.

- [Bulk ingestion and recovery](bulk-ingestion.md)
- [Curated source coverage](curated-ingestion.md)
- [Swarm upload and read steps](../arkiv/swarm.md)
- [Separate public report hosting](dashboard-websites.md)
- [Persistent API and worker deployment](deployment.md)

Do not run the same signer independently on a workstation and a hosted worker. Follow the documented handoff rather than deleting queues or locks.

## Validate and build

```powershell
npm.cmd run typecheck
npm.cmd run test:unit -- --maxWorkers=2
npm.cmd run lint
npm.cmd run build -- --webpack
npm.cmd start
```

The webpack production build is the path used for local release validation. The development command uses Turbopack. On a memory-constrained Windows machine, the successful build used `NODE_OPTIONS=--max-old-space-size=1536` and `RAYON_NUM_THREADS=2`.

`npm.cmd run test:live` performs real read checks through the lower-level `/api/arkiv/status` and `/api/arkiv/query` routes on port 3000. It is separate from controlled unit/browser fixtures and does not by itself prove every publication flow. To benchmark the current verified AXIS query path, run:

```powershell
npx.cmd tsx scripts/axis-read-benchmark.ts <dataset-key> --verify
```

## Workspace routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page |
| `/overview` | Dashboards and the connected wallet's datasets |
| `/explore` | Curated collections, charts, previews, schema and provenance |
| `/query` | Manual/English querying, returned tables, export and save-as-dataset |
| `/datasets`, `/datasets/[id]` | Wallet library, source coverage and owner controls |
| `/dashboards` | Published report library; cards open the editor |
| `/dashboards/new`, `/dashboards/[id]/edit` | Report builder and owner-authorized editing |
| `/dashboards/[id]` | Public report with view filters and refresh |
| `/snapshots` | Arkiv references to Swarm query archives |
| `/ingestion`, `/settings` | Stored-row monitoring and connection settings |
| `/api/axis/*` | Workspace server APIs |
| `/api/reports/[id]/*` | Public-viewer reads scoped to that report's sources |
