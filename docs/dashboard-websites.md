# Separate dashboard websites

AXIS can remain on a local computer. The public website is a separate, read-only
Next.js viewer with no workspace navigation, wallet connection, ingestion tools,
dataset editor or dashboard builder. One viewer serves every published Arkiv
dashboard at `/d/<entity-key>`.

## Host the viewer once

The local AXIS server needs its normal `ARKIV_ACCESS_KEY` and public
`AXIS_INDEXER_ADDRESS`. The indexer private key is never needed for hosting.

From the repository directory on Windows:

```powershell
Set-Location E:\ETHGBL
npx.cmd vercel login
npm.cmd run viewer:deploy
```

The command prepares an explicit allowlist of viewer files in
`.axis/dashboard-viewer`, links one Vercel project, sets only the permitted read
variables (`ARKIV_ACCESS_KEY`, `AXIS_INDEXER_ADDRESS`, and optionally
`ARKIV_RPC_URL`) through stdin as server-only Vercel Secrets, and deploys it.
It never copies `.env` files, the local queue, worker credentials, or workspace
routes. It verifies the production health endpoint without Vercel authentication
before recording the public origin in `.axis/dashboard-viewer-host.json`.

The AXIS server reads that connection at request time; no restart or editing of
`.env.local` is required. To override the saved connection, set
`AXIS_DASHBOARD_VIEWER_URL=https://your-production-domain` on the AXIS server.

For another hosting provider, run `npm.cmd run viewer:prepare`, deploy the output
as a Next.js application with the same read variables, and configure its public
HTTPS origin in `AXIS_DASHBOARD_VIEWER_URL`.

Vercel sources: [Next.js hosting](https://vercel.com/docs/frameworks/full-stack/nextjs),
[environment variables](https://vercel.com/docs/environment-variables),
[deployment protection](https://vercel.com/docs/deployment-protection).
The production domain must allow anonymous viewing for links to be shareable.

## Deploy a dashboard

1. Build a dashboard, enter its title, and click **Deploy**.
2. Confirm the Arkiv wallet transaction if this is a new or changed definition.
3. AXIS reads the saved definition back, then checks that the separate public
   website returns that exact version without authentication.
4. **Open website** and **Copy link** become available after that verification.

Deploying a dashboard does not create a new Vercel project or rebuild the viewer.
Each Arkiv entity key supplies its own URL, layout, titles, queries and settings.
Publishing an update to the same entity changes the report at the same URL.
After changing the viewer's application code, rerun `npm.cmd run viewer:deploy`.

The website independently reads Arkiv, so closing AXIS does not stop viewing,
filtering or its configurable polling. New source records still depend on the
source ingestion worker running wherever it is configured. Arkiv definitions and
source entities retain their expiry; a URL does not extend them.

Public read endpoints restrict queries and schema reads to datasets explicitly
referenced by the selected published dashboard. Visitors can change filters in
their own view. Those filter changes do not update the saved definition. No
wallet, RPC-write proxy or ingestion endpoint exists in the public viewer.

Missing hosting, protected deployments, expired definitions, and mismatched
readbacks show an error and never produce a false success link. Retrying after a
failed website check reuses the saved Arkiv entity instead of creating a duplicate.
