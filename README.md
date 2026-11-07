<p align="center">
  <img src="docs/images/axis-logo.png" alt="AXIS" width="280">
</p>

<h1 align="center">Arkiv eXploration &amp; Intelligence System</h1>

<p align="center">
  <strong>Onchain analytics. Wallet-owned reports.</strong><br>
  Explore verified records, ask a question, and publish a dashboard.<br>
  Built on <strong>Arkiv</strong>, with public query archives on <strong>Swarm</strong>.
</p>

<p align="center">
  <a href="https://axis-platform-e7ac45525b.vercel.app"><strong>Open workspace ↗</strong></a>
  &nbsp; · &nbsp;
  <a href="https://axis-reports-e7ac45525b.vercel.app/d/0xcb7fccae9b8fd715ce0a465687b0e189efb324ce83d07bfd95b781e2902e40c6"><strong>View public dashboard ↗</strong></a>
  &nbsp; · &nbsp;
  <a href="https://bah5acgzaour3xpm3cf6bhox4s6wqeulr46ybuzpvskyfp4qh5oug5wvknnea.bzz.limo/"><strong>Open Swarm archive ↗</strong></a>
</p>

<p align="center">
  <a href="https://docs.arkiv.network/"><img alt="Arkiv · Rabdi testnet" src="https://img.shields.io/badge/Arkiv-Rabdi_testnet-173bff?style=flat-square"></a>
  <a href="arkiv/swarm.md"><img alt="Swarm · Public archives" src="https://img.shields.io/badge/Swarm-Public_archives-ff9d00?style=flat-square"></a>
  <a href="LICENSE"><img alt="License · MIT" src="https://img.shields.io/badge/License-MIT-00a878?style=flat-square"></a>
</p>

<p align="center">
  <a href="#what-you-can-do">Features</a> ·
  <a href="#in-action">Screenshots</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#run-locally">Run locally</a> ·
  <a href="#for-arkiv-judges">Arkiv submission</a>
</p>

<a href="https://axis-platform-e7ac45525b.vercel.app">
  <img src="docs/images/axis-landing.jpg" alt="AXIS landing page with its Arkiv analytics workspace introduction" width="100%">
</a>

## What you can do

AXIS takes a question about onchain activity and turns it into a report you can share. Dataset definitions, published reports, source records and verified coverage live in Arkiv. The current Query Studio and saved-report workflow focus on **Polygon USDC**; the explorer also reads scoped protocol and reference collections.

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>Explore the actual data</h3>
      <p>Browse curated collections with charts, exact-value tables, field schemas and source provenance. See what is covered before trusting a total.</p>
      <a href="https://axis-platform-e7ac45525b.vercel.app/explore">Open Data Explorer →</a>
    </td>
    <td width="50%" valign="top">
      <h3>Ask in English or build filters</h3>
      <p>Describe the records you want, review the generated filters and execute the native Arkiv query. Manual controls remain available.</p>
      <a href="docs/getting-started.md#ask-in-english">How English queries work →</a>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>Own and share the report</h3>
      <p>Save a query scope as a dataset, build a dashboard and publish its definition with your wallet. Readers can open its public URL without signing a transaction.</p>
      <a href="docs/dashboard-websites.md">Public dashboard websites →</a>
    </td>
    <td width="50%" valign="top">
      <h3>Keep a captured result on Swarm</h3>
      <p>Archive verified rows as CSV, JSON and a standalone HTML report. An Arkiv entity points to the public files and their manifest checksum.</p>
      <a href="arkiv/swarm.md">Archive flow and live proof →</a>
    </td>
  </tr>
</table>

## In action

### Activity, composition and exact values

<a href="docs/images/axis-token-activity.jpg">
  <img src="docs/images/axis-token-activity.jpg" alt="Data Explorer showing verified transfer metrics and a vivid stacked activity chart by transfer-size band" width="100%">
</a>

### Relationships and wallet concentration

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="docs/images/axis-signature-provenance.jpg"><img src="docs/images/axis-signature-provenance.jpg" alt="Signature provenance flow chart linking ABI sources to function selectors" width="100%"></a>
      <p><strong>Signature provenance</strong><br>Follow the relationship between ABI sources and observed function selectors.</p>
    </td>
    <td width="50%" valign="top">
      <a href="docs/images/axis-wallet-concentration.jpg"><img src="docs/images/axis-wallet-concentration.jpg" alt="Ranked sending-wallet contribution chart with cumulative transferred-USDC share" width="100%"></a>
      <p><strong>Wallet concentration</strong><br>Compare ranked contributions with cumulative share in one analytical view.</p>
    </td>
  </tr>
</table>

### See what is actually stored

<a href="docs/images/axis-ingestion-monitor.jpg">
  <img src="docs/images/axis-ingestion-monitor.jpg" alt="Ingestion Monitor showing stored Arkiv row counts, block entries and per-table totals" width="100%">
</a>

<sub>These are the original product screenshots supplied for this README. Displayed counts are captures from that moment; live data can change. Click any screenshot to open the full image.</sub>

## Architecture

<a href="docs/images/axis-architecture.svg">
  <img src="docs/images/axis-architecture.svg" alt="AXIS architecture showing Vercel interfaces, the AWS query API and ingestion worker, wallet-owned Arkiv definitions and verified records, OpenRouter filter planning, and Swarm archive files" width="100%">
</a>

1. **Verify the source.** The worker extracts finalized Polygon data, writes records to Arkiv, reads them back and publishes verified coverage.
2. **Query and publish.** The API validates source scopes and filters. A user's wallet signs its dataset and dashboard definitions; the public viewer reads them independently.
3. **Archive the result.** Swarm holds captured report files. Arkiv holds their public reference and checksum. English translation receives the request and selected schemas, not stored record payloads.

The API and worker keep operational state on persistent disk. User signing keys stay in their wallets; the ingestion key stays with the worker. Entity expiry, source-provider trust and Swarm retention remain separate concerns.

[Architecture and trust boundaries](docs/architecture.md) · [Editable Mermaid source](docs/architecture.mmd) · [Deployment details](docs/deployment.md)

## Run locally

Use **Node.js 24** and npm, the versions used for local validation. In a fresh checkout:

```powershell
npm.cmd ci
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

Add the read settings to `.env.local`:

```dotenv
ARKIV_ACCESS_KEY=your_arkiv_access_key
AXIS_INDEXER_ADDRESS=0xe7ac45525bd9fec84902371aaa65cf53c7d89909
```

```powershell
npm.cmd run dev
```

Open **[localhost:3000](http://localhost:3000)**. Get an access key from the [Arkiv Hub](https://hub.arkiv.network/access-keys). Browsing existing data does not need the ingestion private key. Publishing your own report requires a funded Rabdi wallet; English input also needs server-side OpenRouter configuration.

[Complete setup guide](docs/getting-started.md) · [English query settings](docs/getting-started.md#ask-in-english) · [Worker and upload setup](docs/getting-started.md#worker-and-uploads)


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

The Arkiv + Swarm integration includes a verified 1,007-row archive. The actual gateway postage batch/buyer details and the demo-video moment are still unavailable; [the bonus evidence](arkiv/swarm.md) marks those gaps explicitly.

<details>
<summary><strong>Writer wallets and a runnable Arkiv query</strong></summary>

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

</details>

## Build and validate

| Component | Technology |
| --- | --- |
| Interface | Next.js 16, React 19, TypeScript, Tailwind CSS and Radix UI |
| Queryable records and definitions | Arkiv Rabdi, `@arkiv-network/sdk` and viem |
| Public file archives | Swarm, `@ethersphere/bee-js` |
| Optional English query planning | OpenRouter with structured outputs |
| Source preparation | Polygon JSON-RPC, verified adapters, DuckDB and Parquet staging |

```powershell
npm.cmd run typecheck
npm.cmd run test:unit -- --maxWorkers=2
npm.cmd run lint
npm.cmd run build -- --webpack
```

Unit and controlled browser tests are separate from live-provider evidence. The production command above uses the webpack build path used for local release validation; development uses Turbopack. [Validation and live checks](docs/getting-started.md#validate-and-build).

<details>
<summary><strong>Query performance and caching</strong></summary>

On one live scope of 7,380 transfers, local analytics improved from **51.4 seconds to 20.9 seconds**, with the same aggregates as a fresh sequential scan. This is a measured scope, not a universal latency promise. The server uses smaller projections, count-only verification, shared simultaneous reads and four disjoint scan ranges.

Cached dataset and chart views render immediately on revisits within the current tab. Older copies refresh in the background, and explicit Execute/Refresh actions make fresh reads. Copies older than five minutes are discarded on reuse. Missing coverage and refresh failures are surfaced to the reader.

[Performance implementation, limits and benchmark](docs/architecture.md#query-performance) · [Browser caching](docs/architecture.md#browser-caching)

</details>

## Guides

| Guide | What it covers |
| --- | --- |
| [Getting started](docs/getting-started.md) | Environment, English queries, local worker, build and route map |
| [Architecture](docs/architecture.md) | Ownership, trust boundaries, read performance and caching |
| [Public report websites](docs/dashboard-websites.md) | Separate viewer hosting and per-dashboard URLs |
| [Deployment](docs/deployment.md) | Vercel, persistent API/worker hosting, signer handoff and operation |
| [Bulk ingestion](docs/bulk-ingestion.md) | Extraction, checkpoints, publication and recovery |
| [Curated source coverage](docs/curated-ingestion.md) | Adapter scope, reference sources and unavailable data |
| [Publication evidence](docs/bulk-publication.md) | Staged versus published records and real readback results |
| [Swarm bonus](arkiv/swarm.md) | Linked archive, upload/read reproduction and remaining evidence |

## License and AI disclosure

Built for **ETHGlobal Mumbai — Build on Arkiv (from scratch)**. The first recorded project commit is [c1545f7](https://github.com/ReneeMattGH/ETHGBL/commit/c1545f79b0a15d029fa09e32e9ad1f5138fef062), dated 6 November 2026.

AXIS code is available under the [MIT license](LICENSE). Third-party dependencies and imported reference data retain their own licenses; source notices are preserved in [docs/licenses](docs/licenses). We used OpenAI Codex for development and documentation assistance. [AI_DISCLOSURE.md](AI_DISCLOSURE.md) distinguishes that work from the runtime OpenRouter query feature.
