import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type { Job } from "./model";
export const runtimeDirectory = () => join(process.cwd(), ".axis");
export async function readState<T>(name: string, fallback: T): Promise<T> { try { return JSON.parse(await readFile(join(runtimeDirectory(), name + ".json"), "utf8")) as T; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback; throw error; } }
export async function writeState(name: string, value: unknown) { await mkdir(runtimeDirectory(), { recursive: true }); const target = join(runtimeDirectory(), name + ".json"), temporary = target + "." + randomUUID(); await writeFile(temporary, JSON.stringify(value)); await rename(temporary, target); }
export async function withLock<T>(name: string, action: () => Promise<T>, attempts = 50): Promise<T> {
  if (!/^[a-z]+$/.test(name)) throw new Error("Invalid lock name.");
  await mkdir(runtimeDirectory(), { recursive: true }); const path = resolve(runtimeDirectory(), name + ".lock");
  if (!path.startsWith(resolve(runtimeDirectory()) + sep)) throw new Error("Lock is outside the local runtime directory.");
  const ownerPath = join(path, "owner.json");
  for (let index = 0; index < attempts; index++) {
    try { await mkdir(path); await writeFile(ownerPath, JSON.stringify({ pid: process.pid, nonce: randomUUID() })); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const saved = await readFile(ownerPath, "utf8"), owner = JSON.parse(saved) as { pid: number };
        if (Number.isInteger(owner.pid) && owner.pid > 0) {
          try { process.kill(owner.pid, 0); } catch (probe) {
            if ((probe as NodeJS.ErrnoException).code === "ESRCH" && await readFile(ownerPath, "utf8") === saved) { await rm(path, { recursive: true }); index--; continue; }
          }
        }
      } catch { /* A newly created or legacy lock is treated as held, never removed speculatively. */ }
      if (index === attempts - 1) throw new Error(`The ${name} lock is held. Check the other local process before removing its lock.`);
      await new Promise(resolve => setTimeout(resolve, 100)); continue;
    }
    try { return await action(); } finally { await rm(path, { recursive: true }); }
  }
  throw new Error("Cannot acquire local lock.");
}
export async function enqueue(datasetKey: string, owner: string, fromBlock: string, toBlock: string, nonce?: string) {
  return withLock("queue", async () => {
    const jobs = await readState<Job[]>("jobs", []);
    if (nonce) { const used = await readState<string[]>("nonces", []); if (used.includes(nonce)) throw new Error("This signed request has already been used."); await writeState("nonces", [...used.slice(-9999), nonce]); }
    const active = jobs.find(job => job.datasetKey === datasetKey && !["complete", "failed"].includes(job.stage));
    if (active) return active;
    const now = new Date().toISOString();
    const job: Job = { id: randomUUID(), datasetKey, owner, fromBlock, toBlock, stage: "queued", createdAt: now, updatedAt: now, processed: 0, total: 0, duplicates: 0, txHashes: [], error: null };
    await writeState("jobs", [...jobs.slice(-499), job]); return job;
  });
}
export async function saveJob(job: Job) { job.updatedAt = new Date().toISOString(); await withLock("queue", async () => { const jobs = await readState<Job[]>("jobs", []); await writeState("jobs", jobs.map(existing => existing.id === job.id ? job : existing)); }); }
export async function heartbeat() { const state = await readState<{ at: string } | null>("heartbeat", null); return { running: Boolean(state && Date.now() - Date.parse(state.at) < 45000), heartbeat: state?.at ?? null }; }
