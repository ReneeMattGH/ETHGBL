# AXIS deployment

The platform frontend runs on Vercel. The persistent API, live ingestion worker and resumed bulk imports run together on one EC2 server in **Sydney (`ap-southeast-2`)**, using the `axis-production` CLI profile. The separate public dashboard viewer remains its own Vercel project.

## Public endpoints

Initial deployment verified November 7, 2026:

- [AXIS platform](https://axis-platform-e7ac45525b.vercel.app)
- [Sydney API health](https://32-236-64-57.sslip.io/api/health)
- [Separate public dashboard viewer](https://axis-reports-e7ac45525b.vercel.app)

The deployment check reads real Arkiv data through the frontend proxy. A browser check also executes a query, renders its 25-row result table, loads the eight starter dashboard visuals, and verifies that a live amount filter changes the metrics to zero and restores them when cleared. The final browser run reports no page errors or failed API requests. The hosted ingestion worker has completed new on-chain transactions after the queue transfer. Deployment evidence and screenshots are saved under ignored `.axis/deployment`.

## Architecture

- CloudFormation stack: `axis-production-sydney`.
- One Linux `t3.small` (2 vCPU, 2 GiB RAM), eligible for this account's Free Tier plan, with CPU credit mode `standard` to avoid surplus CPU credit charges.
- One encrypted 20 GiB gp3 root volume. `/var/lib/axis/state` contains the shared `.axis` runtime state. Releases link to this directory; updating application code does not replace the queue or checkpoints.
- One Elastic IP, HTTPS through Caddy, and public ports 80/443. Administration uses AWS Systems Manager; SSH is closed.
- Private, encrypted S3 deployment artifacts expire after seven days. This is an artifact bucket, not a backup of the Arkiv database.
- Arkiv holds datasets, published import definitions, source records and dashboard definitions. No external SQL database is introduced for hosting.
- Vercel proxies `/api/axis/*` to the AWS HTTPS API. Only `AXIS_API_ORIGIN` is configured on the frontend. The AWS API explicitly accepts the production `AXIS_FRONTEND_ORIGIN`, preserving the browser origin in signed snapshot requests.
- The API and worker share a filesystem **and the same host PID namespace**. Do not split them into independent containers or replicas without replacing the current file/PID locking design.

## Budget

The requested operating ceiling is US$30/month. The deployment uses one `t3.small` at US$0.0264/hour, 20 GiB gp3 at US$0.096/GiB-month, and one public IPv4 address at US$0.005/hour. At 730 hours this is approximately **US$24.84/month**, before traffic, request charges and taxes. The checked Sydney price-list evidence is under ignored `.axis/deployment`. Credits, if eligible, reduce the bill; the estimate does not assume them.

This instance configuration is not a hard spending cap. Large outbound traffic, accumulated storage and taxes can raise the total. There is no load balancer, NAT gateway or managed SQL instance in this stack. The deployment is one server, without automatic failover. The root volume is retained on instance termination for recovery and continues to incur storage charges until deliberately removed.

The `axis-production-sydney-monthly` AWS Budget tracks Sydney costs before credits/refunds. Email alerts are configured at 80% and 100% of US$30 actual spend, plus forecasted spend above US$30. Billing notifications can be delayed and do not automatically stop resources.

Sources: [EC2 Sydney price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/ap-southeast-2/index.csv), [public IPv4 pricing](https://aws.amazon.com/vpc/pricing/).

## Credentials

`aws login --profile axis-production` establishes the local deployment session. Verify it with `aws sts get-caller-identity --profile axis-production --region ap-southeast-2`.

`npm run aws:release` reads the existing ignored local configuration, scans the allowlisted source files for configured credentials, uploads a source-only release and stores two encrypted standard SSM parameters in Sydney:

- `/axis/production/api-env`: server-side read/provider credentials and public deployment origins.
- `/axis/production/worker-env`: the worker signing key, read from `.env.worker.local`.

The instance fetches these through its role into root-readable `/etc/axis/*.env`. Only the worker service receives the signing key. Environment values are absent from release archives, SSM command text and Vercel configuration. Never upload `.env.local`, `.env.worker.local`, or the complete `.axis` directory to Vercel.

## Release commands (PowerShell)

Run from `E:\ETHGBL`:

```powershell
npm.cmd run typecheck
npm.cmd run platform:prepare
npm.cmd run aws:template
```

For an existing ready CloudFormation stack, install a backend release:

```powershell
npm.cmd run aws:release
```

This starts a Systems Manager command that installs dependencies and builds the release on Linux. It starts the API, and deliberately leaves the worker stopped until the writer handoff. The command ID, instance ID and public API origin are written to ignored `.axis/deployment/aws-release.json`. Inspect that command's completion and `/api/health` before proceeding.

Deploy the generated, separately linked Vercel frontend:

```powershell
npm.cmd run platform:deploy
npm.cmd run platform:verify
```

This requires a Vercel login and a linked `.axis/platform-frontend` project. It uploads no Arkiv/provider/signing configuration. Its resulting production origin must match the API's `AXIS_FRONTEND_ORIGIN`. Generated hosting evidence is saved in `.axis/deployment/platform-host.json`.

## Initial writer handoff

Never run the same signer independently on the workstation and the hosted server. `npm run worker:handoff` acquires the shared local signer lock after the current transaction completes and checks that the chain has no pending signer transaction. While it holds that lock:

1. Stop the local worker and any local bulk supervisor/child processes that use that signer.
2. Confirm those processes have exited, then create `.axis/deployment/signer-handoff-release` to release the barrier.
3. Transfer the final valid queue/nonces, Swarm upload accounting, source alerts, and required bulk staging/publication checkpoints. Exclude locks, heartbeat files, temporary writes, local process IDs and unrelated generated workspaces. Mark migrated bulk status records as stopped until their supervisor resumes.
4. Restore the state into `/var/lib/axis/state`, owned by `axis`.
5. Enable/start `axis-worker.service`. Resume any unfinished bulk import under a service using the same user, working directory, environment files and host PID namespace. Keep each import's recorded publication cost and spending limit.

Bulk publication reconciles already published source records and coverage against Arkiv; do not clear checkpoints or start a new run ID as a substitute for resuming an existing import.

## Verification and operation

Check the public frontend anonymously, its proxied `/api/axis/config`, real dataset/query reads, rejected untrusted-origin requests, and the dashboard viewer connection. Verify `/api/health` reports a recent worker heartbeat, and inspect the worker's journal for real progress or actionable errors. A compiled frontend alone is not end-to-end deployment evidence.

On the server, services are `axis-api`, `axis-worker`, `axis-bulk-import`, and `caddy`; their logs use journald with a 200 MB total journal limit. The initial bulk import retains its existing run ID, publication plan, checkpoints and 1 tGLM publication spending limit. `/srv/axis/current` points to the active source release. Read application logs before restarting services. Do not remove `.axis` state or signer locks to work around a running process.

A generated `sslip.io` address can provide the initial API hostname while a custom domain is chosen. For a custom API domain, update DNS, Caddy, the frontend's `AXIS_API_ORIGIN`, and redeploy the frontend. Keep `AXIS_FRONTEND_ORIGIN` restricted to the actual production frontend.
