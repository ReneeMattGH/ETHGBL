"use client";

import * as React from "react";
import Link from "next/link";
import type { SnapshotList } from "@/lib/axis/swarm-model";
import { useApi, PageIntro, Panel, Notice, RefreshButton, Field, short } from "./shared";
import { useAxisWallet } from "./wallet";

export function SwarmLibrary() {
  const wallet = useAxisWallet();
  const [onlyMine, setOnlyMine] = React.useState(false), [offset, setOffset] = React.useState(0);
  const owner = onlyMine ? wallet.address : null;
  const snapshots = useApi<SnapshotList>(!onlyMine || owner ? `swarm/snapshots?offset=${offset}${owner ? "&owner=" + owner : ""}` : null);
  const data = snapshots.data;
  return <>
    <PageIntro title="Swarm snapshots" description="Archived query results linked from Arkiv. Open a snapshot to verify its files on Swarm."><Link className="axis-button" href="/query">Archive a query</Link></PageIntro>
    <Panel title="Published snapshots" actions={<RefreshButton loading={snapshots.loading} onClick={snapshots.refresh} />}>
      <div className="axis-snapshot-toolbar"><Field label="Show snapshots"><select value={onlyMine ? "mine" : "all"} onChange={event => { setOnlyMine(event.target.value === "mine"); setOffset(0); }}><option value="all">All publishers</option><option value="mine" disabled={!wallet.address}>My wallet</option></select></Field>{data && !snapshots.error && <span>{BigInt(data.total).toLocaleString()} snapshot entities on Arkiv</span>}</div>
      {snapshots.loading && !data && <Notice>Reading snapshot metadata from Arkiv…</Notice>}
      {snapshots.error && <Notice tone="error">{snapshots.failure ?? snapshots.error}<button className="axis-link-button" onClick={snapshots.refresh}>Retry</button></Notice>}
      {onlyMine && !wallet.address && <Notice>Connect your wallet to view its snapshots.</Notice>}
      {data && !snapshots.error && <>
        {data.invalidEntries > 0 && <Notice>{data.invalidEntries} entries on this page have invalid metadata and were excluded.</Notice>}
        {data.snapshots.length ? <>
          <div className="axis-table-wrap axis-snapshot-desktop-table"><table aria-label="Published Swarm snapshots"><thead><tr><th>Snapshot</th><th>Archived rows</th><th>Polygon blocks</th><th>Captured</th><th>Publisher</th></tr></thead><tbody>{data.snapshots.map(snapshot => <tr key={snapshot.entityKey}><td><Link className="axis-inline-link" href={"/snapshots/" + snapshot.entityKey}>{snapshot.document.title}</Link><div className="axis-supporting">{short(snapshot.entityKey, 8)} · Open to verify</div></td><td className="axis-snapshot-count">{snapshot.document.rowCount.toLocaleString()}</td><td>{snapshot.document.fromBlock}–{snapshot.document.throughBlock}</td><td>{new Date(snapshot.document.createdAt).toLocaleString()}</td><td title={snapshot.owner}>{short(snapshot.owner)}</td></tr>)}</tbody></table></div>
          <ul className="axis-snapshot-mobile-list" aria-label="Published Swarm snapshots">{data.snapshots.map(snapshot => <li key={snapshot.entityKey}>
            <h3><Link className="axis-inline-link" href={"/snapshots/" + snapshot.entityKey}>{snapshot.document.title}</Link></h3>
            <div className="axis-snapshot-mobile-meta"><strong className="axis-snapshot-count">{snapshot.document.rowCount.toLocaleString()} rows</strong><span title={snapshot.owner}>{short(snapshot.owner)}</span></div>
            <dl><dt>Polygon blocks</dt><dd>{snapshot.document.fromBlock}–{snapshot.document.throughBlock}</dd><dt>Captured</dt><dd><time dateTime={snapshot.document.createdAt}>{new Date(snapshot.document.createdAt).toLocaleString()}</time></dd></dl>
            <span className="axis-supporting">{short(snapshot.entityKey, 8)} · Open to verify</span>
          </li>)}</ul>
        </> : <p>No published snapshots on this page. Execute a query and choose Archive on Swarm to publish one.</p>}
        <div className="axis-pagination"><button className="axis-button secondary" disabled={offset === 0 || snapshots.loading} onClick={() => setOffset(value => Math.max(0, value - data.limit))}>Previous</button><span>Page {Math.floor(offset / data.limit) + 1} of {Math.max(1, Math.ceil(Number(data.total) / data.limit))}</span><button className="axis-button secondary" disabled={snapshots.loading || BigInt(offset + data.limit) >= BigInt(data.total)} onClick={() => setOffset(value => value + data.limit)}>Next</button></div>
        <p className="axis-supporting axis-snapshot-caption">Arkiv metadata · Files verified when opened.</p>
      </>}
    </Panel>
  </>;
}
