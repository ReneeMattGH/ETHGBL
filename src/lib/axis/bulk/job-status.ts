import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { StageManifest } from "./model";
import { safeError } from "../runtime";
export type BulkJobSummary = { runId: string; phase: string; state: string; stagedBlocks: number; targetBlocks: number; stagedRows: number; updatedAt: string; error: string | null };
export async function bulkJobStatus(): Promise<BulkJobSummary[]> {
  const directory = join(process.cwd(), ".axis", "bulk-jobs");
  let files: string[];
  try { files = await readdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  const jobs: BulkJobSummary[] = [];
  for (const file of files.filter(name => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}\.json$/.test(name))) {
    const state = JSON.parse(await readFile(join(directory, file), "utf8"));
    if (state.version !== 1 || typeof state.runId !== "string" || `${state.runId}.json` !== file) continue;
    // Read only the statically scoped local status data; do not import the CLI extraction graph into Next.js.
    let manifest: StageManifest | null = null;
    try { manifest = JSON.parse(await readFile(join(process.cwd(), ".axis", "bulk", state.runId, "manifest.json"), "utf8")) as StageManifest; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (manifest && !Array.isArray(manifest.parts)) throw new Error("Invalid local bulk progress manifest.");
    let alive = false;
    if (Number.isInteger(state.pid)) { try { process.kill(state.pid, 0); alive = true; } catch {} }
    const running = ["running", "retrying"].includes(state.state);
    jobs.push({ runId: state.runId, phase: String(state.phase), state: running && !alive ? "stopped" : String(state.state), stagedBlocks: manifest?.parts.length ?? 0, targetBlocks: manifest ? Number(BigInt(manifest.config.toBlock) - BigInt(manifest.config.fromBlock) + 1n) : 0, stagedRows: manifest?.parts.reduce((sum, part) => sum + part.records, 0) ?? 0, updatedAt: String(state.updatedAt), error: state.lastEvent?.event === "bulk.failed" ? safeError(String(state.lastEvent.error)) : null });
  }
  return jobs;
}
