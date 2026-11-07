import { Bee, Reference } from "@ethersphere/bee-js";
import { recoverMessageAddress, stringToHex, type Hex } from "viem";
import { runQuery } from "@arkiv-network/sdk/query";
import type { Entity } from "@arkiv-network/sdk";
import { isDeepStrictEqual } from "node:util";
import { validateSnapshotDocument, publicSwarmReference, snapshotIntent, snapshotMessage, SNAPSHOT_FILES, SNAPSHOT_MAX_BYTES, SNAPSHOT_SCHEMA, GATEWAY_POSTAGE_SELECTOR, type SnapshotAuthorization, type SnapshotDocument, type SnapshotManifest, type SnapshotRead, type SnapshotReceipt, type SwarmStatus, type SnapshotList, type SnapshotSummary, type SnapshotPublicationCheck } from "./swarm-model";
import { assertSnapshotResult, buildSnapshotPackage, documentFromManifest, sha256 } from "./swarm-package";
import { executeQuery, executeCombinedQuery, getEntity, documentOf, meta, unpack, baseQuery, literal, FULL_SELECT, pageEntities } from "./store";
import { arkivReader } from "./runtime";
import { readState, writeState, withLock } from "./queue";
import type { QueryResult } from "./model";

const DEFAULT_GATEWAY = "https://api.gateway.ethswarm.org";
const value = (name: string) => process.env[name]?.trim() ?? "";
function readGateway() {
  const template = value("SWARM_READ_GATEWAY_URL") || DEFAULT_GATEWAY;
  if (template.includes("{cid}") && !/^https:\/\/\{cid\}\.[a-zA-Z0-9.-]+\/?$/.test(template)) throw new Error("A CID read gateway must use https://{cid}.gateway-host with no path or credentials.");
  httpUrl(template.replace("{cid}", "example"));
  return template;
}
function httpUrl(input: string) {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Use an HTTP(S) Swarm endpoint without embedded credentials, query parameters or fragments. Use SWARM_API_TOKEN for bearer authentication.");
  return url.toString().replace(/\/+$/, "");
}
export function swarmConfiguration(): SwarmStatus {
  const uploadMode = value("SWARM_UPLOAD_MODE") || "bee";
  if (uploadMode !== "bee" && uploadMode !== "public-gateway") throw new Error("SWARM_UPLOAD_MODE must be bee or public-gateway.");
  if (value("SWARM_SNAPSHOT_PROFILE") && !["report", "data"].includes(value("SWARM_SNAPSHOT_PROFILE"))) throw new Error("SWARM_SNAPSHOT_PROFILE must be report or data.");
  const missing = uploadMode === "bee" ? ["SWARM_BEE_URL", "SWARM_POSTAGE_BATCH_ID"].filter(name => !value(name)) : [];
  if (uploadMode === "public-gateway" && value("SWARM_BEE_URL") && httpUrl(value("SWARM_BEE_URL")) !== DEFAULT_GATEWAY) throw new Error("Public gateway mode uses the official Swarm gateway. Clear SWARM_BEE_URL or set it to the official gateway base URL.");
  if (uploadMode === "public-gateway" && (value("SWARM_API_TOKEN") || value("SWARM_POSTAGE_BATCH_ID") && value("SWARM_POSTAGE_BATCH_ID") !== GATEWAY_POSTAGE_SELECTOR)) throw new Error("Public gateway mode must not send private Bee credentials or a private batch. Clear SWARM_API_TOKEN and SWARM_POSTAGE_BATCH_ID.");
  if (value("SWARM_BEE_URL")) httpUrl(value("SWARM_BEE_URL"));
  readGateway();
  if (value("SWARM_POSTAGE_BATCH_ID")) publicSwarmReference(value("SWARM_POSTAGE_BATCH_ID"));
  if (uploadMode === "bee" && value("SWARM_POSTAGE_BATCH_ID") === GATEWAY_POSTAGE_SELECTOR) throw new Error("The all-zero selector requires explicit public-gateway mode; it is not a real Bee batch.");
  const allowedUploaders = (value("SWARM_ALLOWED_UPLOADERS") || value("AXIS_INDEXER_ADDRESS")).split(",").map(address => address.trim().toLowerCase()).filter(Boolean);
  if (!allowedUploaders.length) missing.push("SWARM_ALLOWED_UPLOADERS");
  if (allowedUploaders.some(address => !/^0x[a-f0-9]{40}$/.test(address))) throw new Error("SWARM_ALLOWED_UPLOADERS must contain comma-separated wallet addresses.");
  if (value("SWARM_BATCH_OWNER_ADDRESS") && !/^0x[a-fA-F0-9]{40}$/.test(value("SWARM_BATCH_OWNER_ADDRESS"))) throw new Error("Invalid SWARM_BATCH_OWNER_ADDRESS.");
  if (value("SWARM_BATCH_DONOR").length > 200 || value("SWARM_UPLOAD_SERVICE_NAME").length > 200) throw new Error("Swarm provenance labels must be under 200 characters.");
  return { configured: !missing.length, missing, allowedUploaders, maxBytes: SNAPSHOT_MAX_BYTES, uploadMode, artifactProfile: value("SWARM_SNAPSHOT_PROFILE") === "data" ? "data" : "report" };
}
export function swarmClient() {
  const status = swarmConfiguration();
  if (!status.configured) throw new Error("Swarm uploads are not configured. Set " + status.missing.join(", ") + ".");
  return new Bee(status.uploadMode === "public-gateway" ? DEFAULT_GATEWAY : httpUrl(value("SWARM_BEE_URL")), { timeout: 120000, endlesslyRetry: false, headers: value("SWARM_API_TOKEN") ? { Authorization: "Bearer " + value("SWARM_API_TOKEN") } : {} });
}
export async function checkSwarmConnection() {
  const config = swarmConfiguration();
  if (!config.configured) return { ...config, connected: false, usable: false };
  if (config.uploadMode === "public-gateway") {
    const response = await fetch(DEFAULT_GATEWAY + "/", { method: "HEAD", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
    return { ...config, connected: response.ok, usable: null, uploadVerified: false, postageSelector: GATEWAY_POSTAGE_SELECTOR, batchId: null, ttlSeconds: null, remainingBytes: null, batchBuyerAddress: null, batchDonor: null, note: "Gateway reachability only. Only a successful upload and readback prove upload availability; actual batch, buyer and retention are undisclosed." };
  }
  const batch = await swarmClient().stamp.get(value("SWARM_POSTAGE_BATCH_ID"), { timeout: 15000 });
  return { ...config, connected: true, usable: batch.usable, batchId: batch.batchID.toHex(), ttlSeconds: batch.duration.toSeconds(), remainingBytes: batch.remainingSize.toBytes(), batchBuyerAddress: value("SWARM_BATCH_OWNER_ADDRESS") || null, batchDonor: value("SWARM_BATCH_DONOR") || null };
}
export function swarmGatewayUrl(reference: string, path = "") {
  if (path && !["manifest.json", ...SNAPSHOT_FILES].includes(path)) throw new Error("Unknown snapshot file.");
  const ref = publicSwarmReference(reference), template = readGateway();
  if (template.includes("{cid}")) return `${httpUrl(template.replace("{cid}", new Reference(ref).toCid("manifest")))}/${path}`;
  return `${httpUrl(template)}/bzz/${ref}/${path}`;
}
// Never forward upload authentication to a read gateway or a URL supplied by an entity.
export async function downloadSwarmFile(reference: string, path: string, limit: number): Promise<Uint8Array> {
  const response = await fetch(swarmGatewayUrl(reference, path), { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(20000) });
  if (response.status >= 300 && response.status < 400) throw new Error(`Swarm gateway redirected ${path}; content approval may be required. The redirected page is not verified snapshot content.`);
  if (!response.ok) throw new Error(`Swarm gateway could not retrieve ${path} (HTTP ${response.status}).`);
  const length = response.headers.get("content-length");
  if (length && Number(length) > limit) { await response.body?.cancel(); throw new Error("Swarm file exceeds its permitted size."); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Swarm returned an empty response.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > limit) throw new Error("Swarm file exceeds its permitted size."); chunks.push(part.value); }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}
export async function verifySwarmSnapshot(document: SnapshotDocument) {
  const d = validateSnapshotDocument(document);
  const manifestBytes = await downloadSwarmFile(d.swarmReference, "manifest.json", 65536);
  if (sha256(manifestBytes) !== d.manifestSha256) throw new Error("Swarm manifest checksum does not match Arkiv.");
  const manifest = JSON.parse(Buffer.from(manifestBytes).toString("utf8")) as SnapshotManifest;
  if (manifest.kind !== "axis.query-snapshot.v1" || !isDeepStrictEqual(validateSnapshotDocument(documentFromManifest(manifest, d.swarmReference, d.manifestSha256)), d) || !isDeepStrictEqual(snapshotIntent(manifest), { title: manifest.title, description: manifest.description, query: manifest.query })) throw new Error("Swarm manifest does not match the published snapshot.");
  const expectedFiles = SNAPSHOT_FILES.filter(path => d.artifactProfile !== "data" || path !== "index.html");
  if (!Array.isArray(manifest.files) || manifest.files.length !== expectedFiles.length || expectedFiles.some(path => manifest.files.filter(file => file.path === path).length !== 1) || manifest.files.some(file => !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[a-f0-9]{64}$/.test(file.sha256)) || manifest.files.reduce((sum, file) => sum + file.bytes, manifestBytes.length) > SNAPSHOT_MAX_BYTES) throw new Error("Invalid snapshot file manifest.");
  const contents: Record<string, Uint8Array> = {};
  for (const file of manifest.files) {
    const bytes = await downloadSwarmFile(d.swarmReference, file.path, file.bytes);
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) throw new Error("Swarm file checksum mismatch: " + file.path);
    contents[file.path] = bytes;
  }
  const result = JSON.parse(Buffer.from(contents["results.json"]).toString("utf8")) as QueryResult;
  assertSnapshotResult(result);
  if (result.entities!.length !== d.rowCount || result.scope.fromBlock !== d.fromBlock || result.scope.toBlock !== d.throughBlock || JSON.stringify((result.sources?.map(source => source.dataset.key) ?? [result.dataset.key]).map(key => key.toLowerCase())) !== JSON.stringify(d.sourceDatasetKeys)) throw new Error("Archived row count or source scope does not match Arkiv.");
  // Rebuild both human-readable exports from the verified JSON, not just their metadata.
  const rebuilt = buildSnapshotPackage(snapshotIntent(manifest), result, d, d.createdAt);
  if (expectedFiles.some(path => sha256(contents[path]) !== sha256(rebuilt.contents[path]))) throw new Error("Archived CSV/report does not match its JSON records.");
  return { result, manifest, contents, verifiedAt: new Date().toISOString() };
}
type UploadEntry = { id: string; publisher: string; createdAt: string; state: "started" | "uploaded" | "verified" | "failed"; document?: SnapshotDocument; receipt?: SnapshotReceipt };

export async function uploadQuerySnapshot(input: unknown, authorization: SnapshotAuthorization, origin: string): Promise<SnapshotReceipt> {
  const intent = snapshotIntent(input), config = swarmConfiguration();
  if (!config.configured) throw new Error("Swarm uploads are not configured. Set " + config.missing.join(", ") + ".");
  if (!authorization || typeof authorization.nonce !== "string" || !/^[a-f0-9]{48}$/.test(authorization.nonce) || !Number.isSafeInteger(authorization.timestamp) || Date.now() - authorization.timestamp > 600000 || authorization.timestamp > Date.now() + 30000 || typeof authorization.signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(authorization.signature)) throw new Error("Invalid or expired snapshot authorization.");
  const message = snapshotMessage(intent, authorization.nonce, authorization.timestamp, origin);
  const publisher = (await recoverMessageAddress({ message, signature: authorization.signature as Hex })).toLowerCase();
  if (!config.allowedUploaders.includes(publisher)) throw new Error("This wallet is not authorized to use the app's Swarm postage batch. Add it to SWARM_ALLOWED_UPLOADERS.");
  const id = sha256(message);
  return withLock("swarm", async () => {
    const history = await readState<UploadEntry[]>("swarm-uploads", []);
    let entry = history.find(item => item.id === id);
    if (entry?.receipt) return entry.receipt;
    if (entry && !entry.document) throw new Error("This upload was interrupted or failed before its reference was recorded. Check Bee before authorizing another upload.");
    if (!entry) {
      // A persistent, app-wide cap bounds postage usage even across server restarts.
      const cap = Number(value("SWARM_MAX_UPLOADS_PER_DAY") || "10");
      if (!Number.isSafeInteger(cap) || cap < 1 || cap > 100) throw new Error("SWARM_MAX_UPLOADS_PER_DAY must be between 1 and 100.");
      if (history.filter(item => Date.parse(item.createdAt) > Date.now() - 86400000).length >= cap) throw new Error("The app's daily Swarm upload limit has been reached.");
      const gatewayProvided = config.uploadMode === "public-gateway";
      const bee = swarmClient(), batch = gatewayProvided ? null : await bee.stamp.get(value("SWARM_POSTAGE_BATCH_ID"), { timeout: 15000 });
      if (batch && (!batch.usable || batch.duration.toSeconds() <= 0)) throw new Error("The configured Swarm postage batch is not usable or has expired.");
      const result = intent.query.queries ? await executeCombinedQuery(intent.query.queries, "export", 0, 25, intent.query.filters.order) : await executeQuery(intent.query.datasetKey, intent.query.filters, "export");
      const packed = buildSnapshotPackage(intent, result, gatewayProvided
        ? { publisher, postageBatchId: null, batchBuyerAddress: null, batchDonor: null, uploadService: DEFAULT_GATEWAY, postageSource: "gateway-provided", postageSelector: GATEWAY_POSTAGE_SELECTOR, ...(value("SWARM_SNAPSHOT_PROFILE") === "data" ? { artifactProfile: "data" as const } : {}) }
        : { publisher, postageBatchId: value("SWARM_POSTAGE_BATCH_ID").toLowerCase(), batchBuyerAddress: value("SWARM_BATCH_OWNER_ADDRESS") || null, batchDonor: value("SWARM_BATCH_DONOR") || null, uploadService: value("SWARM_UPLOAD_SERVICE_NAME") || new URL(value("SWARM_BEE_URL")).origin, ...(value("SWARM_SNAPSHOT_PROFILE") === "data" ? { artifactProfile: "data" as const } : {}) });
      if (batch && batch.remainingSize.toBytes() < packed.totalBytes * 2) throw new Error("The postage batch has insufficient estimated capacity for this snapshot and its manifest overhead.");
      entry = { id, publisher, createdAt: packed.manifest.createdAt, state: "started" };
      history.push(entry);
      await writeState("swarm-uploads", history);
      const files = [...packed.manifest.files.map(file => new File([packed.contents[file.path]], file.path, { type: file.contentType })), new File([packed.manifestText], "manifest.json", { type: "application/json" })];
      try {
        const uploaded = await bee.collection.uploadFromFileList(gatewayProvided ? GATEWAY_POSTAGE_SELECTOR : value("SWARM_POSTAGE_BATCH_ID"), files, { indexDocument: packed.manifest.artifactProfile === "data" ? "manifest.json" : "index.html", encrypt: false, deferred: false });
        const reference = publicSwarmReference(uploaded.reference.toHex());
        entry.document = documentFromManifest(packed.manifest, reference, packed.manifestSha256);
        entry.state = "uploaded";
        await writeState("swarm-uploads", history);
      } catch (error) { entry.state = "failed"; await writeState("swarm-uploads", history); throw error; }
    }
    const document = entry.document!;
    const verified = await verifySwarmSnapshot(document);
    const receipt = { document, gatewayUrl: swarmGatewayUrl(document.swarmReference), verifiedAt: verified.verifiedAt };
    entry.state = "verified"; entry.receipt = receipt;
    await writeState("swarm-uploads", history);
    return receipt;
  }, 1);
}
function snapshotSummary(entity: Entity): SnapshotSummary {
  const document = validateSnapshotDocument(documentOf(entity)), attributes = unpack(entity), metadata = meta(entity);
  if (metadata.owner !== document.publisher.toLowerCase() || attributes.swarmReference !== document.swarmReference || attributes.manifestSha256 !== document.manifestSha256 || attributes.title !== document.title || String(attributes.chainId) !== "137" || String(attributes.rows) !== String(document.rowCount) || attributes.fromBlock !== document.fromBlock || attributes.throughBlock !== document.throughBlock || String(attributes.sourceTime) !== String(Math.floor(Date.parse(document.createdAt) / 1000))) throw new Error("Arkiv snapshot attributes, owner and document do not agree.");
  return { document, entityKey: metadata.key, owner: metadata.owner, expiresAt: metadata.expiresAt, gatewayUrl: swarmGatewayUrl(document.swarmReference) };
}
export async function listArkivSnapshots(owner?: string, offset = 0): Promise<SnapshotList> {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new Error("Invalid snapshot pagination.");
  const limit = 25, result = await pageEntities(baseQuery(SNAPSHOT_SCHEMA, owner), limit, offset, "sourceTime:u64 DESC");
  if (result.count == null) throw new Error("Arkiv did not return a snapshot count.");
  const snapshots: SnapshotSummary[] = []; let invalidEntries = 0;
  for (const entity of result.entities) { try { snapshots.push(snapshotSummary(entity)); } catch { invalidEntries++; } }
  return { snapshots, total: result.count.toString(), offset, limit, invalidEntries };
}
export async function readArkivSnapshot(entityKey: string): Promise<SnapshotRead> {
  const summary = snapshotSummary(await getEntity(SNAPSHOT_SCHEMA, entityKey));
  const verified = await verifySwarmSnapshot(summary.document);
  return { ...summary, verifiedAt: verified.verifiedAt, result: verified.result };
}
export async function prepareSnapshotPublication(input: unknown): Promise<SnapshotPublicationCheck> {
  const document = validateSnapshotDocument(input), existing = await findArkivSnapshot(document);
  if (existing) return { verified: true, publication: { entityKey: existing.entityKey, txHash: existing.txHash }, verifiedAt: existing.readVerifiedAt };
  const verified = await verifySwarmSnapshot(document);
  return { verified: true, publication: null, verifiedAt: verified.verifiedAt };
}
// Reconcile a successful on-chain creation even if recording its local proof was interrupted.
export async function findArkivSnapshot(input: SnapshotDocument) {
  const document = validateSnapshotDocument(input), reader = arkivReader();
  // manifestSha256 is not indexed; compare decoded documents after querying indexed fields.
  const found = await runQuery(reader, { query: `${baseQuery(SNAPSHOT_SCHEMA, document.publisher)} AND swarmReference = ${literal(document.swarmReference)} ORDER BY $key:key ASC`, select: { ...FULL_SELECT, createdAt: true }, limit: 100, count: true });
  if (!found.entities.length) return null;
  if (found.count != null && found.count > 100n) throw new Error("Too many existing snapshot entities to reconcile safely.");
  const entity = [...found.entities].sort((a, b) => (a.createdAt ?? 0n) < (b.createdAt ?? 0n) ? -1 : (a.createdAt ?? 0n) > (b.createdAt ?? 0n) ? 1 : 0)[0];
  if (!isDeepStrictEqual(validateSnapshotDocument(documentOf(entity)), document)) throw new Error("An existing Arkiv snapshot has conflicting metadata.");
  const snapshot = await readArkivSnapshot(String(entity.key));
  let txHash: string | null = null;
  if (entity.createdAt !== undefined) {
    const block = await reader.getBlock({ blockNumber: entity.createdAt, includeTransactions: true });
    const encodedReference = stringToHex(document.swarmReference).slice(2).toLowerCase();
    const candidates = block.transactions.filter(tx => tx.from.toLowerCase() === document.publisher.toLowerCase() && tx.input.toLowerCase().includes(encodedReference));
    if (candidates.length === 1 && (await reader.getTransactionReceipt({ hash: candidates[0].hash })).status === "success") txHash = candidates[0].hash;
  }
  return { entityKey: snapshot.entityKey, txHash, expiresAt: snapshot.expiresAt, readVerifiedAt: snapshot.verifiedAt };
}
export async function resumeSwarmUpload(id: string): Promise<SnapshotReceipt> {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid upload ID.");
  return withLock("swarm", async () => {
    const history = await readState<UploadEntry[]>("swarm-uploads", []), entry = history.find(item => item.id === id);
    if (!entry?.document) throw new Error("No recorded Swarm reference exists for this upload. Check Bee before uploading again.");
    const verified = await verifySwarmSnapshot(entry.document);
    const receipt = { document: entry.document, gatewayUrl: swarmGatewayUrl(entry.document.swarmReference), verifiedAt: verified.verifiedAt };
    entry.receipt = receipt; entry.state = "verified";
    await writeState("swarm-uploads", history);
    return receipt;
  }, 1);
}
