# Who AXIS is for

AXIS is for a small Web3 team that wants to answer a concrete question about its onchain activity and share the answer. A treasury operator might ask, “Which wallets received more than 100 USDC?” A protocol contributor might want a report that keeps updating without rebuilding a spreadsheet every morning.

Our first audience is Polygon treasury and operations teams. The Query Studio and saved-dashboard workflow currently focus on verified USDC transfers. The Data Explorer also reads scoped protocol and reference collections, but we are not claiming complete Polygon history or general analytics over every token and protocol.

## Why we think they would use it

The useful loop is short: pick a dataset, write filters or ask in English, inspect the actual records, and turn the query into a dashboard. The saved report keeps its source queries and layout. A teammate can open its public URL without connecting a wallet, change filters for their own view, and inspect the query and coverage behind the numbers.

That is our product hypothesis, not customer validation. We have not established external active-user numbers, paid customers or a named pilot team. Our current evidence is a working public flow and real Arkiv data, not a waitlist presented as usage.

## Try it today

- [Open AXIS](https://axis-platform-e7ac45525b.vercel.app).
- [Open the public Polygon USDC dashboard](https://axis-reports-e7ac45525b.vercel.app/d/0xcb7fccae9b8fd715ce0a465687b0e189efb324ce83d07bfd95b781e2902e40c6).
- [Read the source](https://github.com/ReneeMattGH/ETHGBL) or follow the [local setup](../README.md#run-locally).

Start with the public dashboard. It is the shortest path to seeing the product, and viewing does not need a wallet transaction. In the workspace, open Query Studio, select the available USDC dataset and execute a query. Saving your own dataset or dashboard requires a Rabdi wallet and testnet funds. English input also depends on the configured OpenRouter service; manual filters remain available.

The frontend, backend health endpoint and public report returned HTTP 200 when checked on **7 November 2026**. The report definition was independently read from Arkiv and contained **eight widgets**. At **02:18:54 UTC**, a live coverage check found **8,726 verified transfers across 42 manifests**, with no coverage gaps in that checked scope. The live worker can advance after that observation. [Recorded evidence](proof.json).

The public viewer has a separate deployment and reads Arkiv independently of the local workspace. Source updates still need the ingestion worker. Hosting and entity retention also have to remain funded; this is a testnet demo, not an uptime guarantee. [Deployment details](../docs/deployment.md), [viewer setup](../docs/dashboard-websites.md).

## After Mumbai

We plan to keep the scope small enough to learn from real use. The next step is to invite three to five treasury or protocol-operations users to try one recurring report each. We want to learn whether they can get from a question to a useful shared report without help, whether they return to that report, and where they stop trusting the data.

Our first improvements would be clearer source coverage and retention, a less technical path from a question to a saved report, and more predictable full-result query latency. Broader tokens and protocol-specific saved dashboards come after that. We would measure completed reports and repeat visits before making claims about adoption.

Those are next steps, not existing partnerships or promised delivery dates. The code is open under the [MIT license](../LICENSE), so another team can run the app or build a different reader even if our hosted demo stops.
