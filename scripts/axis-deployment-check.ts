import { readFile, writeFile } from "node:fs/promises";

const deployed = JSON.parse(await readFile(".axis/deployment/platform-host.json", "utf8"));
const frontend: string = deployed.frontendOrigin, backend: string = deployed.apiOrigin;
async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${new URL(url).pathname} failed (HTTP ${response.status}).`);
  return response.json();
}
const frontendHealth = await json(frontend + "/api/health");
if (frontendHealth.service !== "axis-platform") throw new Error("Public frontend is not available anonymously.");
const backendHealth = await json(backend + "/api/health");
if (backendHealth.service !== "axis-api" || backendHealth.region !== "ap-southeast-2") throw new Error("The API is not reporting Sydney.");
const config = await json(frontend + "/api/axis/config");
if (!config.arkivConfigured || !config.polygonConfigured || !config.finalizedBlock) throw new Error("Hosted provider reads are unavailable.");
if (!config.worker?.running) throw new Error("Hosted ingestion worker heartbeat is not current.");
const catalog = await json(frontend + "/api/axis/datasets");
if (!Array.isArray(catalog.datasets) || !catalog.datasets.length) throw new Error("The hosted catalog returned no Arkiv datasets.");
const dataset = catalog.datasets.find((item: { resultSource?: unknown }) => !item.resultSource) ?? catalog.datasets[0];
const result = await json(frontend + "/api/axis/query", { method: "POST", headers: { "Content-Type": "application/json", Origin: frontend }, body: JSON.stringify({ datasetKey: dataset.key, filters: {}, mode: "page", limit: 1 }) });
if (!Array.isArray(result.entities)) throw new Error("The public query did not return a result table.");
const rejected = await fetch(frontend + "/api/axis/query", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://untrusted.invalid" }, body: "{}", signal: AbortSignal.timeout(30000) });
if (rejected.status !== 403) throw new Error("The hosted mutation origin restriction is not enforced.");
const viewer = await json(frontend + "/api/axis/dashboard-deploy");
if (!viewer.configured || !viewer.viewerUrl) throw new Error("Dashboard website hosting is not connected.");
const viewerHealth = await json(viewer.viewerUrl + "/api/health");
if (viewerHealth.service !== "axis-dashboard-viewer") throw new Error("The separate dashboard viewer is unavailable.");
const proof = { checkedAt: new Date().toISOString(), frontend, backend, region: backendHealth.region, anonymousFrontend: true, workerHeartbeat: config.worker.heartbeat, arkivDatasets: catalog.datasets.length, queriedDataset: dataset.key, queryRows: result.entities.length, untrustedOriginStatus: rejected.status, dashboardViewer: viewer.viewerUrl };
await writeFile(".axis/deployment/verified.json", JSON.stringify(proof, null, 2) + "\n");
console.log(JSON.stringify(proof, null, 2));
