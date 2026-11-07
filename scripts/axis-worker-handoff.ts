import nextEnv from "@next/env";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withLock } from "../src/lib/axis/queue";
import { arkivReader, writerAddress } from "../src/lib/axis/runtime";
import type { Address } from "viem";

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const directory = join(process.cwd(), ".axis/deployment");
const marker = join(directory, "signer-handoff-held.json"), release = join(directory, "signer-handoff-release");
await mkdir(directory, { recursive: true });
await rm(marker, { force: true }); await rm(release, { force: true });
await withLock("signer", async () => {
  const reader = arkivReader(), address = writerAddress() as Address;
  const [latest, pending] = await Promise.all([reader.getTransactionCount({ address, blockTag: "latest" }), reader.getTransactionCount({ address, blockTag: "pending" })]);
  if (latest !== pending) throw new Error("A signer transaction is still pending; reconcile it before moving the worker.");
  await writeFile(marker, JSON.stringify({ pid: process.pid, nonce: latest, at: new Date().toISOString() }));
  console.log("Signer handoff lock held; no pending transaction. Local writers can now be stopped safely.");
  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline) {
    try { await access(release); return; } catch {}
    await new Promise(accept => setTimeout(accept, 500));
  }
  throw new Error("Handoff lock timed out; verify local writers before starting a hosted worker.");
}, 3000);
await rm(marker, { force: true }); await rm(release, { force: true });
console.log("Signer handoff lock released.");
