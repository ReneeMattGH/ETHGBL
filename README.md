# ARKIV VIZ — Query-to-Dashboard Studio

Built for **ETHGlobal Mumbai**. ARKIV VIZ turns live Arkiv queries into persistent dashboards: query real entities, inspect the fields the node actually returns, compose visualizations from compatible fields, and keep the view fresh with polling.

There is no mock data anywhere. Every entity, count, field type and error rendered by the app comes from the Arkiv network (Rabdi Testnet) through the official `@arkiv-network/sdk`. If the network is unreachable, the app says so instead of substituting sample rows.

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

The integration is isolated in `src/lib/arkiv/`. The access key is read **server-side only** and is never sent to the browser.

Create `.env.local`:

```bash
ARKIV_ACCESS_KEY=your_key_here
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

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Overview, live connection status, recent dashboards, empty state |
| `/query` | Query builder: raw Arkiv predicate, visual filter composer, syntax help, real execution, entity/field/request inspection, pagination |
| `/dashboards` | Saved dashboards and deletion |
| `/dashboards/new` | Query → preview → visualization → layout → save |
| `/dashboards/[id]` | Live dashboard with polling, manual refresh, freshness and error recovery |
| `/settings` | Connection details, default refresh, density, theme, local workspace profile, config export |
| `POST /api/arkiv/query` | Server-only query execution and entity normalization |
| `GET /api/arkiv/status` | Server-only connection check via `getBlockTiming()` |

## How real Arkiv access works

- Queries execute through `runQuery(client, { query, select, limit, offset, count })` from `@arkiv-network/sdk/query`.
- The query language is the node's own predicate syntax (`str('v')`, `u64(1)`, `key(0x…)`, `BETWEEN`, `STARTSWITH`, `ORDER BY $expiresAt:u64 DESC`, …). Invalid predicates surface the node's structured error kind and position.
- Pages are capped at 100 rows by the node; the UI reports both the page rows and the node-reported total count.
- `$createdAt` / `$updatedAt` / `$expiresAt` are **block numbers**, not wall-clock timestamps. The UI labels them as blocks.
- Requests are cancellable via `AbortController`. Sequence guards prevent stale responses from overwriting newer results.
- Access keys and RPC URLs are redacted from error details before they reach the client.
- Numeric parsing respects the Arkiv type tag: integers outside the safe JS range are rejected rather than rounded, unsigned types reject negative values, and a field observed with conflicting types is marked `mixed` and never charted as a number.

## Testing

```bash
npm run test:unit   # Vitest: parsing, field inference, aggregation, recommendations, query language
npm run test:live   # Real-network checks against a running server on :3000
```

`test:live` calls the real `/api/arkiv/status` and `/api/arkiv/query` routes and asserts connection, block metadata, real entities, stable key pagination, zero-result success, invalid-query rejection, refresh re-execution and validation. It exits non-zero and prints the actual failure when the node is unreachable or rate-limited; it never substitutes fabricated results.

## Persistence and live refresh

- Dashboards and settings are stored in `localStorage` (`arkiv-viz:dashboards:v1`, `arkiv-viz:settings:v1`). There is no backend and no authentication.
- Dashboard configs store the query, limit, selected fields, visualization types, chart config, layout, refresh interval and timestamps. They never store entity data.
- Live dashboards re-run the saved query on a configurable interval using chained `setTimeout` polling (no WebSocket/streaming claims). Failures keep the last successful data visible and are labelled as stale.
- Widgets disclose how many rows were sampled. Aggregations use only the rows returned by the page; the node's total count is shown separately.
- The live view shows the block each result was read at, plus the latest block observed by the connection poll, so expiry and freshness are distinguishable.
- A starter layout is recommended from fields that actually appear in the first successful result. Every recommended widget is validated against the returned fields before it is saved.
- Entity tables support search, sort and client-side paging over the rows the node returned; the query builder additionally pages the node with offset pagination.

## Layout

```
src/
  app/                 routes and server API endpoints
  components/
    query/             editor, filters, results, entity inspection
    dashboard/         builder, live view, widgets, charts
    network/           connection badge/panel/status
    overview/          overview hero + recent dashboards
    settings/          settings surfaces
    ui/                shadcn primitives
  hooks/               query runner, live polling, copy, clock
  lib/
    arkiv/
      server/          server-only client, errors, service
      query-language   literals, predicates, tokenizer, examples
    dashboard/         config types + local storage
    visualization/     field inference, aggregation/series builders, recommendations
scripts/
  verify-live.mjs      real-network verification against the running API routes
```
