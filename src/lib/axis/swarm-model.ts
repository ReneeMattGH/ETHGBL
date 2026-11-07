import { validateQuerySources } from "./core";
import type { QueryDefinition, QueryResult } from "./model";

export const SNAPSHOT_SCHEMA = "axis.snapshot.v1";
export const SNAPSHOT_MAX_BYTES = 20 * 1024 * 1024;
export const GATEWAY_POSTAGE_SELECTOR = "0".repeat(64);
export const SNAPSHOT_FILES = ["results.json", "results.csv", "index.html"] as const;
export type SnapshotFile = typeof SNAPSHOT_FILES[number];
export type SnapshotIntent = { title: string; description: string; query: QueryDefinition };
export type SnapshotAuthorization = { nonce: string; timestamp: number; signature: string };
export type SnapshotDocument = {
  version: 1; title: string; description: string; publisher: string; createdAt: string;
  swarmReference: string; manifestSha256: string; rowCount: number; chainId: 137;
  fromBlock: string; throughBlock: string; sourceDatasetKeys: string[];
  postageBatchId: string | null; batchBuyerAddress: string | null; batchDonor: string | null; uploadService: string;
  postageSource?: "gateway-provided"; postageSelector?: string;
  artifactProfile?: "data";
};
export type SnapshotManifest = Omit<SnapshotDocument, "swarmReference" | "manifestSha256"> & {
  kind: "axis.query-snapshot.v1"; query: QueryDefinition;
  files: { path: SnapshotFile; sha256: string; bytes: number; contentType: string }[];
};
export type SnapshotReceipt = { document: SnapshotDocument; gatewayUrl: string; verifiedAt: string };
export type SnapshotRead = SnapshotReceipt & { entityKey: string; owner: string; expiresAt: string; result: QueryResult };
export type SnapshotSummary = { entityKey: string; owner: string; expiresAt: string; document: SnapshotDocument; gatewayUrl: string };
export type SnapshotList = { snapshots: SnapshotSummary[]; total: string; offset: number; limit: number; invalidEntries: number };
export type SnapshotPublicationCheck = { verified: true; publication: { entityKey: string; txHash: string | null } | null; verifiedAt: string };
export type SwarmStatus = { configured: boolean; missing: string[]; allowedUploaders: string[]; maxBytes: number; uploadMode?: "bee" | "public-gateway"; artifactProfile?: "report" | "data" };

export function publicSwarmReference(value: unknown): string {
  if (typeof value !== "string" || !/^[a-fA-F0-9]{64}$/.test(value)) throw new Error("A public 64-character Swarm reference is required. Encrypted references cannot be published.");
  return value.toLowerCase();
}
export function snapshotIntent(input: unknown): SnapshotIntent {
  const value = input as SnapshotIntent;
  if (!value || typeof value.title !== "string" || !value.title.trim() || value.title.length > 80 || typeof value.description !== "string" || value.description.length > 2000 || !value.query) throw new Error("Enter a snapshot title of 1–80 characters and a description under 2000 characters.");
  const sources = validateQuerySources(value.query.queries ?? [value.query]);
  return { title: value.title.trim(), description: value.description, query: { ...sources[0], ...(sources.length > 1 ? { queries: sources } : {}) } };
}
export function snapshotMessage(input: SnapshotIntent, nonce: string, timestamp: number, origin: string) {
  return `AXIS public Swarm snapshot\nOrigin: ${origin}\nIntent: ${JSON.stringify(snapshotIntent(input))}\nNonce: ${nonce}\nIssued at: ${timestamp}\nUpload the full verified query result publicly to Swarm using the app's postage batch. A separate Arkiv transaction publishes its reference.`;
}
export function validateSnapshotDocument(input: unknown): SnapshotDocument {
  const d = input as SnapshotDocument;
  if (!d || d.version !== 1 || typeof d.title !== "string" || !d.title.trim() || d.title.length > 80 || typeof d.description !== "string" || d.description.length > 2000 || !/^0x[0-9a-fA-F]{40}$/.test(d.publisher) || d.chainId !== 137 || !Number.isSafeInteger(d.rowCount) || d.rowCount < 0 || d.rowCount > 20000 || !/^\d+$/.test(d.fromBlock) || !/^\d+$/.test(d.throughBlock) || BigInt(d.fromBlock) > BigInt(d.throughBlock) || !Number.isFinite(Date.parse(d.createdAt)) || !/^[a-f0-9]{64}$/.test(d.manifestSha256) || !Array.isArray(d.sourceDatasetKeys) || !d.sourceDatasetKeys.length || d.sourceDatasetKeys.length > 20 || d.sourceDatasetKeys.some(key => !/^0x[a-f0-9]{64}$/.test(key)) || typeof d.uploadService !== "string" || d.uploadService.length > 200 || !(d.batchBuyerAddress === null || /^0x[0-9a-fA-F]{40}$/.test(d.batchBuyerAddress)) || !(d.batchDonor === null || typeof d.batchDonor === "string" && d.batchDonor.length <= 200)) throw new Error("Invalid Arkiv snapshot document.");
  if (d.postageSource === "gateway-provided") {
    if (d.postageBatchId !== null || d.postageSelector !== GATEWAY_POSTAGE_SELECTOR || d.batchBuyerAddress !== null || d.batchDonor !== null) throw new Error("Gateway-provided postage must record the selector separately and leave undisclosed batch/buyer details unknown.");
  } else if (d.postageSource !== undefined || d.postageSelector !== undefined || typeof d.postageBatchId !== "string" || !/^[a-f0-9]{64}$/.test(d.postageBatchId) || d.postageBatchId === GATEWAY_POSTAGE_SELECTOR) throw new Error("A real postage batch ID is required in Bee mode. The all-zero gateway selector is not a batch ID.");
  if (d.artifactProfile !== undefined && d.artifactProfile !== "data") throw new Error("Unknown snapshot artifact profile.");
  return { ...d, swarmReference: publicSwarmReference(d.swarmReference) };
}
