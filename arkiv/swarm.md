# AXIS: public query snapshots on Arkiv and Swarm

## Current evidence

**Live upload, Arkiv publication and remote readback verified on 7 November 2026.** The official public upload gateway supplied postage using its all-zero selector. A separate CID-based `bzz.limo` route served all four archived files, including HTML, with matching checksums. The snapshot contains **1,007 real Polygon USDC records over blocks 96,864,289–96,864,328**. This is live integration evidence; complete prize eligibility remains unestablished because the gateway has not disclosed the actual postage batch and buyer/donor details, and the demo video is not yet recorded.

| Submission evidence | Current value |
| --- | --- |
| Arkiv snapshot entity key | `0x1a8d55399f8eedc9377a3e26ba34abc116d20b6eeb7599bb996a086fbcbc0109` |
| Arkiv creation transaction | `0xe3aebb9fb0579dbb5b6644c29e9337d88ec06ae56a8f837a8019f35b174a20cf` |
| Swarm collection reference | `7523bbbd9b117c13bafc97ad025171e7b01a65f592b057f207eba86edaaa6b48` |
| Openable Swarm report | [Open live report](https://bah5acgzaour3xpm3cf6bhox4s6wqeulr46ybuzpvskyfp4qh5oug5wvknnea.bzz.limo/) |
| Manifest with file hashes | [Open manifest](https://bah5acgzaour3xpm3cf6bhox4s6wqeulr46ybuzpvskyfp4qh5oug5wvknnea.bzz.limo/manifest.json) |
| Postage batch ID | **Unknown: gateway-provided postage.** The all-zero selector is not an actual batch ID. |
| Wallet that bought the batch, or donor | **Unknown: not disclosed by the gateway.** The Arkiv publisher below is not claimed to be the batch buyer. |
| Uploading Bee node/service | `https://api.gateway.ethswarm.org/bzz`; gateway's underlying Bee node identity undisclosed |
| Serving/read service | CID subdomain on `bzz.limo`; HTML on `bzz.link` and the API gateway redirected to approval |
| Arkiv publisher wallet | `0xe7ac45525bd9fec84902371aaa65cf53c7d89909` |
| Demo video timestamp | Pending recording of the real flow |

Public evidence and file checksums are recorded in [`swarm-proof.json`](swarm-proof.json). The CLI also maintains the ignored operator copy `.axis/swarm-proof.json`. The shared app viewer is `/snapshots/0x1a8d55399f8eedc9377a3e26ba34abc116d20b6eeb7599bb996a086fbcbc0109`. That route runs in the separately hosted AXIS app; the report link above is served from Swarm.

## What lives where

The default `report` profile stores an immutable collection of four public files on Swarm:

- `results.json`: the entire bounded, verified query export, with exact integer amounts as strings, source datasets, filters/coverage evidence and capture metadata.
- `results.csv`: all exported records, including token contract and decimals. Formula-like spreadsheet cells are escaped; original JSON values are preserved.
- `index.html`: a standalone report showing capture scope and the first 100 rows, with full CSV/JSON download links. No application server is needed to render this file.
- `manifest.json`: query definition, row count, source keys, captured block interval, publisher, upload provenance, and each file's SHA-256 and byte length.

An optional `data` profile stores just `results.json`, `results.csv` and `manifest.json`; its root opens the JSON manifest, and AXIS provides the shared viewer. The documented primary live snapshot uses the full report profile. The profile is explicitly recorded when data-only; readers do not silently skip a missing report from a full snapshot.

Arkiv holds a wallet-owned `axis.snapshot.v1` entity. The **`swarmReference` field** contains the public collection's 64-hex reference. `manifestSha256` anchors the manifest bytes. Other fields are `title`, `chainId`, `rows`, `fromBlock`, `throughBlock`, `sourceTime` and a `document` containing the same metadata and provenance. Entity ownership must agree with the manifest publisher. The client uses a 30-day Arkiv expiry. Gateway uploads record `postageSource: "gateway-provided"`, a separate all-zero `postageSelector`, and null actual batch/buyer/donor fields. This avoids publishing a selector as fabricated batch evidence.

The underlying ingestion entities remain on Arkiv. Archiving does not increase the ingestion monitor's Arkiv row count. The snapshot viewer reads the Arkiv entity and then the Swarm collection; it does not rerun a live query to replace expired or changed source data.

Only public snapshots are supported. Uploads explicitly use `encrypt: false`; both publication and reads reject 128-hex encrypted references. An encrypted reference contains its decryption key and must never be written publicly as-is. Private snapshots and feeds are outside this implementation.

## Upload and read code

| File | Responsibility |
| --- | --- |
| `src/lib/axis/swarm.ts` | Bee connection and batch checks, signed upload authorization, server-side query export, SDK collection upload, independent gateway downloads, checksum verification, Arkiv-linked reads, recovery |
| `src/lib/axis/swarm-package.ts` | CSV, JSON, HTML report, checksums, manifest and size validation |
| `src/lib/axis/swarm-model.ts` | Public reference/document validation, signed intent format and shared types |
| `src/lib/axis/swarm-schema.ts` | Arkiv snapshot schema |
| `src/app/api/axis/swarm/[...path]/route.ts` | Status/check/upload/snapshot-read endpoints |
| `src/components/axis/swarm-snapshot.tsx` | Public consent, publishing progress, retry and shared viewer |
| `src/components/axis/swarm-recovery.ts` | Browser-local recovery of public upload receipts, isolated by query and publishing wallet |
| `src/components/axis/swarm-library.tsx` | Paginated snapshot library, reading actual Arkiv entity metadata |
| `src/components/axis/wallet.tsx` | Browser-wallet intent signature and Arkiv entity transaction |
| `src/components/axis/query-studio.tsx` | Archive action on executed query results |
| `src/app/snapshots/[id]/page.tsx` | Shareable Arkiv-key-based viewer |
| `src/app/snapshots/page.tsx` | Snapshot library available from the workspace navigation |
| `scripts/axis-swarm.ts` | Operator connection check, upload, publication, read and recovery |

The application uses the official `@ethersphere/bee-js` SDK, pinned to 13.2.0. We consulted Swarm's official quickstart skill and MCP implementation; a Swarm MCP server is not configured in this session and is not required by the running application.

## Requirements and configuration

Use Node.js 20 or newer (validated here with Node.js 24), existing Arkiv read access, a verified Polygon transfer dataset in this app, and a funded Rabdi wallet for the snapshot entity. Choose either public-gateway mode or your own upload-capable Bee light/full node with a usable funded batch. The public gateway accepted our upload without a personal Swarm account, Bee node or postage purchase. No code automatically buys or tops up batches.

The working public-gateway setup in ignored `.env.local` is:

```dotenv
SWARM_UPLOAD_MODE=public-gateway
SWARM_SNAPSHOT_PROFILE=report
SWARM_BEE_URL=
SWARM_POSTAGE_BATCH_ID=
SWARM_API_TOKEN=
SWARM_BATCH_OWNER_ADDRESS=
SWARM_BATCH_DONOR=
SWARM_ALLOWED_UPLOADERS=0xYOUR_PUBLISHING_WALLET
SWARM_READ_GATEWAY_URL=https://{cid}.bzz.limo
SWARM_MAX_UPLOADS_PER_DAY=10
```

Replace only the publishing wallet placeholder with your public wallet address. The upload target is the official API gateway and the SDK sends the all-zero postage selector. This mode skips private `/stamps` APIs, does not claim capacity/TTL measurements, and refuses private Bee tokens or a private batch to prevent forwarding those credentials to the public service. Upload and read availability remain subject to gateway policies and limits.

For a private Bee deployment, set `SWARM_UPLOAD_MODE=bee`, supply `SWARM_BEE_URL`, a real `SWARM_POSTAGE_BATCH_ID`, and optional bearer `SWARM_API_TOKEN`; record the actual buyer/donor details. Service URLs must not embed credentials or query strings. Ultra-light nodes cannot upload. The app never forwards upload authentication to read gateways. The buyer address is public, never a private key.

The read setting accepts either a `/bzz` gateway base URL or an HTTPS `https://{cid}.gateway-host` template. The latter converts the collection reference to its Swarm manifest CID using the SDK. HTML at our reference returned HTTP 302 to a hash-approval page through `bzz.link` and the API gateway, while the CID `bzz.limo` route returned HTTP 200 and exact HTML bytes. Redirects are not accepted as verified content. The app reads only its explicitly configured gateway; it does not automatically route around denials.

The wallet that clicks Publish must be in `SWARM_ALLOWED_UPLOADERS`; if omitted, the app defaults to the public `AXIS_INDEXER_ADDRESS`. A private batch buyer can be a different wallet from the Arkiv publisher. In Bee mode a deployed Next.js server needs a reachable protected Bee endpoint; its localhost is not your laptop. Public-gateway mode uses its remote HTTPS service.

The upload journal and daily limit use the project's existing `.axis` filesystem state and process locks. Run this deployment on a single server with a persistent writable volume. A read-only or ephemeral serverless deployment is not an upload deployment: move journals/locks/quotas to a shared durable store before using multiple replicas or serverless functions. Request duration must allow the upload and gateway verification (the route declares up to 300 seconds).

## Run one upload and one read in the app

Open **Swarm snapshots** in the workspace sidebar to find existing publications. The list reads metadata from Arkiv; opening an entry independently verifies all archived file checksums. Invalid entity metadata is excluded with an explicit notice. Row counts in the list are labeled as Arkiv metadata and are not presented as freshly verified Swarm reads.

1. Run `npm.cmd install`, configure the settings above, then `npm.cmd run swarm -- check`. In public-gateway mode expect `connected: true`, `usable: null`, and null actual batch/capacity/TTL fields. This check establishes reachability, not a successful upload. Bee mode instead checks `stamp.get` and reports its actual usable flag/capacity/TTL.
2. Start `npm.cmd run dev` and open `/query`. Select a dataset with verified imported records and execute the query. Optionally fill the dataset name/description; these become the snapshot title/description when publishing starts.
3. In **Archive on Swarm**, check **Make these query results public on Swarm** and choose **Publish public snapshot**. Approve the intent signature. The server performs a full export, enforces 20,000 rows / 20 MiB, checks the postage batch, uploads with `deferred: false`, and independently fetches all four files through the read gateway.
4. Confirm the separate Arkiv transaction in the same wallet. Choose **Open snapshot**. Expect a share URL `/snapshots/<entityKey>`, the exact archived row count and block interval, an Arkiv entity key, a Swarm reference and downloadable CSV/JSON/report links.
5. Open that share URL in a second browser without connecting a wallet. Expect **Verified … archived rows** only after the viewer reads Arkiv and validates the remote manifest, all file hashes, file sizes, row count and source interval. Checksum/read failures hide the archived table instead of displaying a fabricated result.

The working report URL is the CID-based `bzz.limo` link in the evidence table above. The API gateway accepted uploads but did not serve this unapproved HTML root; successful upload and successful site serving are separate checks.

## CLI reproduction on Windows

Run these commands from `E:\ETHGBL`. The upload/publish commands explicitly load the existing ignored `.env.worker.local` signer; check/read commands do not load that signer. Add its public address to the uploader allowlist. The worker needs tGLM for the Arkiv entity transaction, separately from any Swarm postage funding.

```powershell
npm.cmd run swarm -- check
npm.cmd run swarm -- upload --dataset YOUR_VERIFIED_DATASET_KEY --title "Polygon snapshot" --publish
npm.cmd run swarm -- read --entity YOUR_RETURNED_ARKIV_ENTITY_KEY
```

Expected upload output: real row count, reference, public gateway URL and a receipt at `.axis/swarm-last-receipt.json`. Expected publication output: real Arkiv entity/transaction keys and `.axis/swarm-proof.json`. Expected read output: the same reference and row count with a fresh verification timestamp. CLI publication uses the existing shared worker signer lock.

Upload and Arkiv publication are separate transactions. To upload without publishing, omit `--publish`; later run `npm.cmd run swarm -- publish`. Publication first reconciles existing entities using indexed owner/reference fields, compares manifest documents and verifies remote files. The recovered creation transaction is checked in the entity's creation block. SDK bigint expiry values are serialized as strings in proof files. A live repeat returned the same primary entity/transaction without a new write.

If network upload succeeds but public gateway verification fails, use the matching `id` in `.axis/swarm-uploads.json`:

```powershell
npm.cmd run swarm -- resume --upload-id YOUR_RECORDED_UPLOAD_ID --publish
```

Resume verifies the recorded reference without uploading again. In the browser, successful public upload receipts are saved locally per query and publisher, without storing signing keys or upload signatures. After a refresh, select the same query and wallet to resume. **Start a new archive** explicitly discards the saved receipt. On retry, the server verifies the remote files and checks for an existing matching Arkiv entity before the browser requests another transaction. Successful publication clears the pending receipt. Browser storage can be disabled; in that case in-memory and CLI recovery remain available.

Upload authorization is valid for 10 minutes; local CLI recovery remains available afterward. An interrupted upload without a recorded reference deliberately requires operator investigation rather than silently spending postage again. Do not delete the journal to bypass that safeguard. The read-only publication preparation endpoint is `POST /api/axis/swarm/publication`; snapshot metadata is listed at `GET /api/axis/swarm/snapshots` with optional owner/offset parameters.

## Demo video

**Timestamp pending.** Record execute query → public consent → Swarm upload/readback → Arkiv publication → open the share link in another browser → download CSV or view the standalone Swarm report. Record the actual timestamp here after filming.

## What got in the way

- We initially required a personal Bee node/batch and missed the public gateway's postage selector. The official MCP code confirms the selector route; a real upload now verifies it. Actual batch/buyer/donor details and retention remain unknown, so the full bonus evidence requirement is still incomplete.
- Official quickstart examples use older SDK method names while bee-js 13 uses namespaces such as `bee.collection` and `bee.stamp`. We checked installed types and exercised the real SDK against a local HTTP server.
- A returned reference does not prove files are publicly served. We use direct uploads and require checksum readback through the configured separate gateway before publication. The API gateway and `bzz.link` redirected the HTML to approval, while `bzz.limo` CID routing served the exact file. We recovered the original uploaded report without uploading again.
- Live testing caught a bigint expiry serialization error and a reconciliation predicate on a non-indexed field, which produced duplicate data-only definitions during initial testing. Those historical definitions remain public; the primary full-report entity documented here is unique for its reference. Proof serialization and indexed-field reconciliation are corrected and covered by regression checks.
- Swarm funding and Arkiv fees/expiry are separate. Postage TTL changes and capacity estimates are not permanent storage guarantees. Operators must monitor and fund retention through judging and beyond as needed.
- The query path is currently the project's verified Polygon transfer datasets. Bulk Parquet partitions and frozen dashboard configurations are future extensions, not features claimed by this submission.

## References

- [Swarm upload/download](https://docs.ethswarm.org/docs/develop/upload-and-download/)
- [bee-js upload/download](https://bee-js.ethswarm.org/docs/upload-download/)
- [Upload synchronization](https://bee-js.ethswarm.org/docs/tracking-uploads/)
- [Postage batches](https://docs.ethswarm.org/docs/develop/tools-and-features/buy-a-stamp-batch/)
- [Manifests](https://docs.ethswarm.org/docs/develop/tools-and-features/manifests/)
- [Encryption/reference handling](https://docs.ethswarm.org/docs/develop/tools-and-features/store-with-encryption/)
- [Bee API security](https://docs.ethswarm.org/docs/bee/working-with-bee/bee-api/)
- [Official Swarm quickstart skill](https://github.com/ethersphere/swarm-quickstart-skills/blob/main/.claude/skills/swarm-build-app/SKILL.md)
- [Official Swarm MCP](https://github.com/ethersphere/swarm-mcp)
- [MCP gateway selector constant](https://github.com/ethersphere/swarm-mcp/blob/3730908696f920e0f50fe5f8651fbccdb17fa078/src/constants.ts)
- [MCP postage fallback](https://github.com/ethersphere/swarm-mcp/blob/3730908696f920e0f50fe5f8651fbccdb17fa078/src/utils/upload-stamp.ts)
- [Swarm Gateway CID subdomain routing](https://github.com/ethersphere/swarm-gateway)
