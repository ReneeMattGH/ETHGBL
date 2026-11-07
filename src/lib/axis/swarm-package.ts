import { createHash } from "node:crypto";
import { MAX_SCOPE_ROWS, type QueryResult, type Transfer } from "./model";
import { SNAPSHOT_FILES, SNAPSHOT_MAX_BYTES, type SnapshotManifest, type SnapshotIntent, type SnapshotDocument, type SnapshotFile } from "./swarm-model";

export const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const html = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
export const CSV_FIELDS: (keyof Transfer)[] = ["datasetKey", "sourceId", "chainId", "contract", "blockNumber", "blockHash", "timestamp", "txHash", "logIndex", "sender", "recipient", "amountRaw", "amount", "decimals", "contentHash", "entityKey"];
export function snapshotCsv(rows: Transfer[]) {
  const cell = (value: unknown) => { const text = String(value ?? ""); return '"' + (/^[=+\-@\t\r\n]/.test(text) ? "'" + text : text).replace(/"/g, '""') + '"'; };
  return [CSV_FIELDS.join(","), ...rows.map(row => CSV_FIELDS.map(field => cell(row[field])).join(","))].join("\r\n");
}
export function assertSnapshotResult(result: QueryResult) {
  if (!result || !Array.isArray(result.entities) || result.entities.length > MAX_SCOPE_ROWS || !result.coverage?.throughBlock || result.coverage.gaps.length || !/^\d+$/.test(result.scope?.fromBlock) || !/^\d+$/.test(result.scope?.toBlock) || BigInt(result.scope.fromBlock) > BigInt(result.scope.toBlock) || result.dataset.chainId !== 137 || result.sources?.some(source => source.dataset.chainId !== 137 || !source.coverage.throughBlock || source.coverage.gaps.length)) throw new Error("A complete export of a verified Polygon scope is required for a snapshot.");
  if (new Set(result.entities.map(row => row.sourceId)).size !== result.entities.length) throw new Error("Snapshot contains duplicate source records.");
  if (result.entities.some(row => row.chainId !== 137 || !/^\d+$/.test(row.blockNumber) || BigInt(row.blockNumber) < BigInt(result.scope.fromBlock) || BigInt(row.blockNumber) > BigInt(result.scope.toBlock))) throw new Error("Snapshot rows are outside the verified scope.");
}
export function snapshotReport(title: string, description: string, result: QueryResult) {
  const rows = result.entities!;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${html(title)} · AXIS</title><style>body{font:16px/1.6 system-ui;margin:40px auto;padding:0 24px;max-width:1200px;color:#111;background:#fff}h1{font-size:32px}a{color:#153cff}nav{display:flex;gap:24px;margin:24px 0}.table{overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid #ddd;white-space:nowrap}code{overflow-wrap:anywhere}</style><header><p>AXIS / Public query snapshot</p><h1>${html(title)}</h1><p>${html(description)}</p><p>${rows.length.toLocaleString("en-US")} archived rows · Polygon blocks ${html(result.scope.fromBlock)}–${html(result.scope.toBlock)}</p><p>Captured ${html(result.fetchedAt)}. This report shows the first ${Math.min(rows.length, 100)} rows; downloads contain every archived row.</p><nav><a href="results.csv" download>Download CSV</a><a href="results.json" download>Download JSON</a><a href="manifest.json">File checksums</a></nav></header><div class="table"><table><thead><tr><th>Block</th><th>Transaction</th><th>Sender</th><th>Recipient</th><th>Amount (raw)</th></tr></thead><tbody>${rows.slice(0, 100).map(row => `<tr><td>${html(row.blockNumber)}</td><td>${html(row.txHash)}</td><td>${html(row.sender)}</td><td>${html(row.recipient)}</td><td>${html(row.amountRaw)}</td></tr>`).join("")}</tbody></table></div><p>Amounts retain their exact integer values. Use each record's contract and decimals when interpreting token quantities. Storage availability depends on postage funding; this is not a promise of permanent retention.</p></html>`;
}
export function buildSnapshotPackage(intent: SnapshotIntent, result: QueryResult, provenance: Pick<SnapshotDocument, "publisher" | "postageBatchId" | "batchBuyerAddress" | "batchDonor" | "uploadService" | "postageSource" | "postageSelector" | "artifactProfile">, createdAt = new Date().toISOString()) {
  assertSnapshotResult(result);
  const contents: Record<SnapshotFile, string> = { "results.json": JSON.stringify(result), "results.csv": snapshotCsv(result.entities!), "index.html": snapshotReport(intent.title, intent.description, result) };
  const contentTypes = { "results.json": "application/json", "results.csv": "text/csv;charset=utf-8", "index.html": "text/html;charset=utf-8" };
  const manifest: SnapshotManifest = { version: 1, kind: "axis.query-snapshot.v1", title: intent.title, description: intent.description, publisher: provenance.publisher, postageBatchId: provenance.postageBatchId, batchBuyerAddress: provenance.batchBuyerAddress, batchDonor: provenance.batchDonor, uploadService: provenance.uploadService, createdAt, query: intent.query, rowCount: result.entities!.length, chainId: 137, fromBlock: result.scope.fromBlock, throughBlock: result.scope.toBlock, sourceDatasetKeys: (result.sources?.map(source => source.dataset.key) ?? [result.dataset.key]).map(key => key.toLowerCase()), files: SNAPSHOT_FILES.map(path => ({ path, sha256: sha256(contents[path]), bytes: Buffer.byteLength(contents[path]), contentType: contentTypes[path] })) };
  if (provenance.postageSource) { manifest.postageSource = provenance.postageSource; manifest.postageSelector = provenance.postageSelector; }
  if (provenance.artifactProfile) { manifest.artifactProfile = provenance.artifactProfile; manifest.files = manifest.files.filter(file => file.path !== "index.html"); }
  const manifestText = JSON.stringify(manifest);
  const totalBytes = Buffer.byteLength(manifestText) + manifest.files.reduce((sum, file) => sum + file.bytes, 0);
  if (totalBytes > SNAPSHOT_MAX_BYTES) throw new Error("Snapshot exceeds 20 MiB. Narrow the query before publishing.");
  return { manifest, manifestText, manifestSha256: sha256(manifestText), contents, totalBytes };
}
export function documentFromManifest(manifest: SnapshotManifest, swarmReference: string, manifestSha256: string): SnapshotDocument {
  const { kind: _kind, query: _query, files: _files, ...document } = manifest;
  void _kind; void _query; void _files;
  return { ...document, swarmReference, manifestSha256 };
}
