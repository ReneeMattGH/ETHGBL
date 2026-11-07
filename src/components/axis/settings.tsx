"use client";
import type { PlatformConfig } from "@/lib/axis/model";
import type { SwarmStatus } from "@/lib/axis/swarm-model";
import { useApi, PageIntro, Panel, Notice, RefreshButton } from "./shared";
import { useAxisWallet } from "./wallet";
export function AxisSettings() {
  const config = useApi<PlatformConfig>("config"), swarm = useApi<SwarmStatus>("swarm/status"), wallet = useAxisWallet();
  const data = config.error ? null : config.data, swarmData = swarm.error ? null : swarm.data;
  const connectionLabel = (configured: boolean | undefined, failed: boolean) => failed ? "Unavailable" : configured === undefined ? "Checking" : configured ? "Configured" : "Not configured";
  return <>
    <PageIntro title="Settings & connections"><RefreshButton loading={config.loading || swarm.loading} onClick={() => { config.refresh(); swarm.refresh(); }} /></PageIntro>
    {config.error && <Notice tone="error">{config.error}</Notice>}
    {data?.error && <Notice tone="error">{data.error}</Notice>}
    {swarm.error && <Notice tone="error">Swarm: {swarm.error}</Notice>}
    <div className="axis-settings-grid">
      <Panel title="Connections"><dl className="axis-details">
        <dt>Polygon RPC</dt><dd><span className={`axis-badge ${data?.polygonConfigured ? "success" : ""}`}>{connectionLabel(data?.polygonConfigured, Boolean(config.error))}</span></dd>
        <dt>Finalized block</dt><dd className="axis-mono">{data?.finalizedBlock ?? "—"}</dd>
        <dt>Arkiv</dt><dd><span className={`axis-badge ${data?.arkivConfigured ? "success" : ""}`}>{connectionLabel(data?.arkivConfigured, Boolean(config.error))}</span></dd>
        <dt>Swarm uploads</dt><dd><span className={`axis-badge ${swarmData?.configured ? "success" : ""}`}>{connectionLabel(swarmData?.configured, Boolean(swarm.error))}</span></dd>
        <dt>Network</dt><dd>Rabdi · 7794095 · tGLM</dd>
        <dt>Worker</dt><dd><span className={`axis-badge ${data?.worker.running ? "success" : ""}`}>{config.error ? "Unavailable" : !data ? "Checking" : data.worker.running ? "Running" : "Offline"}</span></dd>
        <dt>Record publisher</dt><dd className="axis-mono">{data?.writer ?? "—"}</dd>
      </dl></Panel>
      <div className="axis-settings-stack">
        <Panel title="Wallet"><div className="axis-wallet-identity"><span className={`axis-badge ${wallet.address ? "success" : ""}`}>{wallet.address ? "Connected" : "Not connected"}</span><span className="axis-mono">{wallet.address ?? "Connect to manage your definitions."}</span></div><button className="axis-button secondary" disabled={wallet.busy} onClick={() => void wallet.connect().catch(() => {})}>{wallet.busy ? "Connecting…" : "Connect / switch wallet"}</button></Panel>
        <details className="axis-reference"><summary>Local runtime</summary><dl className="axis-details"><dt>Website</dt><dd><code>npm.cmd run dev</code></dd><dt>Worker</dt><dd><code>npm.cmd run worker</code></dd><dt>RPC configuration</dt><dd><code>.env.local</code></dd><dt>Worker identity</dt><dd><code>.env.worker.local</code></dd><dt>Local queue</dt><dd><code>.axis/</code></dd></dl><p>Restart the relevant process after changing credentials. Analytical records and published definitions are read from Arkiv.</p></details>
        <details className="axis-reference"><summary>Retention & calculation policy</summary><ul><li>Definitions and records: 30 days. Ingestion statuses: 7 days.</li><li>Owners renew definitions; the worker renews records with <code>npm.cmd run worker:renew</code>.</li><li>USDC totals use integer base units, displayed at six decimals.</li><li>Gross volume includes mint, burn, zero-value and self-transfer events.</li><li>Unique wallets include sender and recipient addresses, including the zero address.</li><li>Maximum 20,000 records per analytics query; narrow the scope for larger datasets.</li></ul></details>
      </div>
    </div>
  </>;
}
