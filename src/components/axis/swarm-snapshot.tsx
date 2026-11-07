"use client";

import * as React from "react";
import Link from "next/link";
import type { QueryDefinition } from "@/lib/axis/model";
import { snapshotIntent, type SnapshotAuthorization, type SnapshotRead, type SnapshotReceipt, type SwarmStatus } from "@/lib/axis/swarm-model";
import { api, useApi, Panel, Notice, PageIntro, TransferTable, RefreshButton } from "./shared";
import { authorizeSnapshot, publishSnapshot, useAxisWallet, walletError } from "./wallet";
import { usePendingSnapshot, rememberSnapshot, forgetSnapshot } from "./swarm-recovery";

export function SnapshotPublisher({ query, title, description, disabled, onBusyChange }: { query: QueryDefinition; title: string; description: string; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const wallet = useAxisWallet(), status = useApi<SwarmStatus>("swarm/status");
  const [consent, setConsent] = React.useState(false), [busy, setBusy] = React.useState(false), [stage, setStage] = React.useState("");
  const [uploadedReceipt, setReceipt] = React.useState<SnapshotReceipt | null>(null), [published, setPublished] = React.useState<{ entityKey: string; owner: string } | null>(null), [error, setError] = React.useState<string | null>(null);
  const recovered = usePendingSnapshot(query, wallet.address);
  const receipt = uploadedReceipt?.document.publisher.toLowerCase() === wallet.address?.toLowerCase() ? uploadedReceipt : recovered;
  const entityKey = published?.owner.toLowerCase() === wallet.address?.toLowerCase() ? published?.entityKey : null;
  const pending = React.useRef<{ intent: ReturnType<typeof snapshotIntent>; authorization: SnapshotAuthorization; owner: string } | null>(null);
  const allowed = !wallet.address || status.data?.allowedUploaders?.includes(wallet.address.toLowerCase());
  const publish = async () => {
    if (busy || disabled || !consent || (!receipt && (!status.data?.configured || !allowed))) return;
    setBusy(true); onBusyChange(true); setError(null);
    try {
      const account = wallet.address ?? await wallet.connect();
      let uploaded = receipt;
      if (!uploaded) {
        if (!pending.current || pending.current.owner.toLowerCase() !== account.toLowerCase()) {
          const intent = snapshotIntent({ title: title || "Query snapshot", description, query });
          setStage("Authorize public upload in your wallet…");
          pending.current = { intent, authorization: await authorizeSnapshot(account, intent), owner: account };
        }
        setStage("Exporting, uploading and verifying through Swarm…");
        uploaded = await api<SnapshotReceipt>("swarm/upload", pending.current);
        rememberSnapshot(query, uploaded); setReceipt(uploaded);
      }
      setStage("Confirm the Arkiv transaction in your wallet…");
      const publication = await publishSnapshot(account, uploaded.document);
      forgetSnapshot(query, account); setPublished({ entityKey: publication.entityKey, owner: account }); setStage("");
    } catch (caught) { setError(walletError(caught)); setStage(""); }
    finally { setBusy(false); onBusyChange(false); }
  };
  return <Panel title="Archive on Swarm" className="axis-swarm-publisher">
    <p>{status.data?.artifactProfile === "data" ? "Freeze the full verified result as CSV and JSON on Swarm. Publish its reference on Arkiv and share the snapshot viewer." : "Freeze the full verified result as CSV, JSON and a shareable report. Publish its Swarm reference on Arkiv."}</p>
    {status.data?.uploadMode === "public-gateway" && <Notice>Uploads use gateway-provided postage. The actual batch, buyer and retention period are undisclosed.</Notice>}
    {status.error && <Notice tone="error">{status.error}<button className="axis-link-button" onClick={status.refresh}>Retry connection</button></Notice>}
    {status.data?.configured === false && <Notice>Swarm uploads need server configuration: {status.data.missing.join(", ")}.<button className="axis-link-button" onClick={status.refresh}>Check again</button></Notice>}
    {!allowed && !receipt && <Notice>This wallet is not authorized to use the app&apos;s postage batch.</Notice>}
    <label className="axis-swarm-consent"><input type="checkbox" checked={consent} disabled={busy || Boolean(entityKey)} onChange={event => setConsent(event.target.checked)} />Make these query results public on Swarm.</label>
    <div className="axis-actions"><button className="axis-button secondary" disabled={disabled || busy || !consent || (!receipt && (!status.data?.configured || !allowed)) || Boolean(entityKey)} onClick={() => void publish()}>{busy ? "Publishing…" : receipt ? "Publish reference to Arkiv" : "Publish public snapshot"}</button>{entityKey && <Link className="axis-button" href={"/snapshots/" + entityKey}>Open snapshot</Link>}<Link className="axis-inline-link" href="/snapshots">Browse snapshots</Link></div>
    {stage && <p role="status">{stage}</p>}
    {error && <Notice tone="error">{error}</Notice>}
    {receipt && !entityKey && <Notice>Resume “{receipt.document.title}” · {receipt.document.rowCount.toLocaleString()} rows. The upload is saved in this browser. Its files will be verified again before publishing.<button type="button" className="axis-link-button" disabled={busy} onClick={() => { forgetSnapshot(query, receipt.document.publisher); setReceipt(null); pending.current = null; setConsent(false); setError(null); }}>Start a new archive</button></Notice>}
    {receipt && <a className="axis-inline-link" href={receipt.gatewayUrl} target="_blank" rel="noreferrer">{receipt.document.artifactProfile === "data" ? "Open manifest on Swarm ↗" : "Open archived report on Swarm ↗"}</a>}
    {entityKey && <Notice tone="success">Snapshot published. The viewer verifies its files against the checksum stored on Arkiv.</Notice>}
  </Panel>;
}

export function SnapshotViewer({ entityKey }: { entityKey: string }) {
  const snapshot = useApi<SnapshotRead>("swarm/snapshots/" + encodeURIComponent(entityKey));
  const [page, setPage] = React.useState(0);
  const data = snapshot.data;
  return <>
    <PageIntro title={data?.document.title ?? "Archived snapshot"} description={data?.document.description}><RefreshButton loading={snapshot.loading} onClick={snapshot.refresh} label="Verify snapshot again" /><Link className="axis-button secondary" href="/snapshots">All snapshots</Link></PageIntro>
    {snapshot.loading && <Notice>Reading the Arkiv reference and verifying the archived Swarm files…</Notice>}
    {snapshot.error && <Notice tone="error">{snapshot.failure ?? snapshot.error}<button className="axis-link-button" onClick={snapshot.refresh}>Retry read</button></Notice>}
    {data && !snapshot.error && <>
      <Notice tone="success">Verified {data.document.rowCount.toLocaleString()} archived rows against the manifest checksum on Arkiv.</Notice>
      <Panel title="Snapshot details" className="axis-snapshot-details">
        <dl><dt>Polygon blocks</dt><dd>{data.document.fromBlock}–{data.document.throughBlock}</dd><dt>Captured</dt><dd>{new Date(data.document.createdAt).toLocaleString()}</dd><dt>Last verified</dt><dd><time dateTime={data.verifiedAt}>{new Date(data.verifiedAt).toLocaleString()}</time></dd><dt>Publisher</dt><dd>{data.owner}</dd><dt>Arkiv entity</dt><dd>{data.entityKey}</dd><dt>Swarm reference</dt><dd>{data.document.swarmReference}</dd><dt>Manifest SHA-256</dt><dd>{data.document.manifestSha256}</dd></dl>
        <p>Frozen results from the recorded scope. Swarm availability depends on postage funding; the Arkiv reference has its own expiry.</p>
        {data.document.postageSource === "gateway-provided" && <Notice>Gateway-provided postage: actual batch ID, buyer and retention period are unknown.</Notice>}
        <div className="axis-actions"><a className="axis-button" href={data.gatewayUrl} target="_blank" rel="noreferrer">{data.document.artifactProfile === "data" ? "Open Swarm manifest ↗" : "Open Swarm report ↗"}</a><a className="axis-button secondary" href={data.gatewayUrl + "results.csv"} target="_blank" rel="noreferrer">CSV</a><a className="axis-button secondary" href={data.gatewayUrl + "results.json"} target="_blank" rel="noreferrer">JSON</a><a className="axis-inline-link" href={data.gatewayUrl + "manifest.json"} target="_blank" rel="noreferrer">Manifest</a></div>
      </Panel>
      <Panel title="Archived records">
        <TransferTable rows={data.result.entities!.slice(page * 25, (page + 1) * 25)} sources={data.result.recordDatasets} />
        <div className="axis-pagination"><button className="axis-button secondary" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page + 1} · {data.document.rowCount.toLocaleString()} archived rows</span><button className="axis-button secondary" disabled={(page + 1) * 25 >= data.document.rowCount} onClick={() => setPage(value => value + 1)}>Next</button></div>
      </Panel>
    </>}
  </>;
}
