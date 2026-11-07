import nextEnv from "@next/env";
import { existsSync } from "node:fs";
import { ExpirationTime } from "@arkiv-network/sdk";
import { u64 } from "@arkiv-network/sdk/schema";
import { stringToBytes } from "viem";
import { randomBytes } from "node:crypto";
import { snapshotIntent, snapshotMessage, validateSnapshotDocument, type SnapshotReceipt } from "../src/lib/axis/swarm-model";
import { SnapshotSchema } from "../src/lib/axis/swarm-schema";

nextEnv.loadEnvConfig(process.cwd(), undefined, { info: () => {}, error: () => {} });
const { checkSwarmConnection, uploadQuerySnapshot, readArkivSnapshot, resumeSwarmUpload } = await import("../src/lib/axis/swarm");
const { safeError, workerWriter } = await import("../src/lib/axis/runtime");
const { serialWorkerWriter } = await import("../src/lib/axis/signing");
const { readState, writeState } = await import("../src/lib/axis/queue");
const args = process.argv.slice(2), command = args[0];
function option(name: string) { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1]; }
function loadSigner() { if (existsSync(".env.worker.local")) process.loadEnvFile(".env.worker.local"); return workerWriter(); }
try {
  if (command === "check") {
    const check = await checkSwarmConnection(); console.log(JSON.stringify(check, null, 2));
    if (!check.connected || check.usable === false) process.exitCode = 1;
  } else if (command === "read") {
    const key = option("--entity"); if (!key) throw new Error("Pass --entity <Arkiv entity key>.");
    const snapshot = await readArkivSnapshot(key);
    console.log(JSON.stringify({ entityKey: key, swarmReference: snapshot.document.swarmReference, rows: snapshot.document.rowCount, gatewayUrl: snapshot.gatewayUrl, verifiedAt: snapshot.verifiedAt }, null, 2));
  } else if (command === "upload" || command === "resume") {
    let receipt: SnapshotReceipt;
    if (command === "resume") {
      const id = option("--upload-id"); if (!id) throw new Error("Pass --upload-id from .axis/swarm-uploads.json.");
      receipt = await resumeSwarmUpload(id);
    } else {
      const key = option("--dataset"); if (!key) throw new Error("Pass --dataset <verified dataset key> and --title <title>.");
      const filters = option("--filters") ? JSON.parse(option("--filters")!) : {};
      const intent = snapshotIntent({ title: option("--title") ?? "Polygon query snapshot", description: option("--description") ?? "", query: { datasetKey: key, filters } });
      const writer = loadSigner(), timestamp = Date.now(), nonce = randomBytes(24).toString("hex"), origin = "axis-cli://local";
      const signature = await writer.signMessage({ account: writer.account, message: snapshotMessage(intent, nonce, timestamp, origin) });
      receipt = await uploadQuerySnapshot(intent, { signature, nonce, timestamp }, origin);
    }
    await writeState("swarm-last-receipt", receipt);
    console.log(JSON.stringify({ uploaded: true, rows: receipt.document.rowCount, reference: receipt.document.swarmReference, gatewayUrl: receipt.gatewayUrl, receiptFile: ".axis/swarm-last-receipt.json" }, null, 2));
    if (args.includes("--publish")) await publish(receipt);
  } else if (command === "publish") {
    const receipt = await readState<SnapshotReceipt | null>("swarm-last-receipt", null);
    if (!receipt) throw new Error("Run upload or resume first.");
    await publish(receipt);
  } else {
    console.log("Usage: npm run swarm -- check | upload --dataset <key> --title <title> [--filters <JSON>] [--publish] | resume --upload-id <id> [--publish] | publish | read --entity <key>");
  }
} catch (error) { console.error(safeError(error)); process.exitCode = 1; }

async function publish(receipt: SnapshotReceipt) {
  const document = validateSnapshotDocument(receipt.document), writer = loadSigner();
  if (writer.account.address.toLowerCase() !== document.publisher.toLowerCase()) throw new Error("The configured worker must be the wallet that authorized this upload.");
  // Reverify remote content before spending Arkiv fees, including resumed uploads.
  const { verifySwarmSnapshot } = await import("../src/lib/axis/swarm");
  await verifySwarmSnapshot(document);
  const { findArkivSnapshot } = await import("../src/lib/axis/swarm");
  const existing = await findArkivSnapshot(document);
  if (existing) {
    await writeState("swarm-proof", { ...receipt, ...existing });
    console.log(JSON.stringify({ reused: true, ...existing, reference: document.swarmReference, gatewayUrl: receipt.gatewayUrl, rows: document.rowCount, sharePath: "/snapshots/" + existing.entityKey, proofFile: ".axis/swarm-proof.json" }, null, 2));
    return;
  }
  const previous = await readState<{ document: typeof document; entityKey: string; txHash: string } | null>("swarm-proof", null);
  if (previous?.document.swarmReference === document.swarmReference && previous.document.publisher === document.publisher) {
    await readArkivSnapshot(previous.entityKey);
    console.log(JSON.stringify({ reused: true, entityKey: previous.entityKey, gatewayUrl: receipt.gatewayUrl })); return;
  }
  const created = await serialWorkerWriter().createEntity(SnapshotSchema, {
    title: document.title, swarmReference: document.swarmReference, manifestSha256: document.manifestSha256,
    chainId: u64(document.chainId), rows: u64(document.rowCount), fromBlock: u64(document.fromBlock), throughBlock: u64(document.throughBlock),
    sourceTime: u64(Math.floor(Date.parse(document.createdAt) / 1000)), document: stringToBytes(JSON.stringify(document)),
  }, { expiration: ExpirationTime.fromDays(30) });
  const published = { entityKey: created.entityKey, txHash: created.txHash, expiresAt: created.expiresAt.toString() };
  // Record the transaction immediately, even if indexing/readback has to be retried.
  await writeState("swarm-proof", { ...receipt, ...published });
  let snapshot;
  for (let attempt = 0; attempt < 4; attempt++) {
    try { snapshot = await readArkivSnapshot(published.entityKey); break; }
    catch (error) { if (attempt === 3) throw error; await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1))); }
  }
  await writeState("swarm-proof", { ...receipt, ...published, readVerifiedAt: snapshot!.verifiedAt });
  console.log(JSON.stringify({ published: true, entityKey: published.entityKey, txHash: published.txHash, reference: document.swarmReference, gatewayUrl: receipt.gatewayUrl, rows: document.rowCount, sharePath: "/snapshots/" + published.entityKey, proofFile: ".axis/swarm-proof.json" }, null, 2));
}
