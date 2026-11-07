import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { runDirectory, atomicJson } from "../src/lib/axis/bulk/staging";

const { values } = parseArgs({ options: { run: { type: "string" }, "max-spend": { type: "string", default: "1" }, from: { type: "string" }, to: { type: "string" }, blocks: { type: "string" }, tokens: { type: "string" }, config: { type: "string" }, concurrency: { type: "string" }, enriched: { type: "boolean" }, traces: { type: "boolean" }, tables: { type: "string" } } });
if (!values.run) throw new Error("Specify --run ID; optionally supply the initial extraction scope.");
const directory = runDirectory(values.run), jobDirectory = join(process.cwd(), ".axis", "bulk-jobs");
await mkdir(jobDirectory, { recursive: true });
const status = { version: 1, runId: values.run, pid: process.pid, phase: "starting", state: "running", attempt: 0, updatedAt: new Date().toISOString(), lastEvent: {} as object };
let saves = Promise.resolve(), lineBuffer = "", lastError = "";
const save = () => { status.updatedAt = new Date().toISOString(); const snapshot = structuredClone(status); saves = saves.then(() => atomicJson(join(jobDirectory, `${values.run}.json`), snapshot)); return saves; };
try {
  for (const phase of ["extract", "decode", ...(values.enriched ? ["enrich"] : []), "publish"]) {
    status.phase = phase;
    let completed = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      status.attempt = attempt + 1; status.state = "running"; await save(); lastError = "";
      let configured = false;
      try { await readFile(join(directory, "manifest.json"), "utf8"); configured = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      const sourceArgs = phase === "extract" && !configured ? (["from", "to", "blocks", "tokens", "config", "concurrency"] as const).flatMap(name => values[name] === undefined ? [] : [`--${name}`, values[name]!]) : [];
      const args = ["--import", "tsx", "scripts/axis-bulk.ts", phase, "--run", values.run, ...sourceArgs, ...(phase === "enrich" && values.traces ? ["--traces"] : []), ...(phase === "publish" ? ["--max-spend", values["max-spend"]!, ...(values.enriched ? ["--enriched"] : []), ...(values.tables ? ["--tables", values.tables] : [])] : [])];
      const code = await new Promise<number | null>((resolve, reject) => {
        const child = spawn(process.execPath, args, { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
        child.on("error", reject); child.on("close", resolve);
        child.stdout.on("data", (buffer: Buffer) => {
          process.stdout.write(buffer); lineBuffer += buffer.toString();
          const lines = lineBuffer.split("\n"); lineBuffer = lines.pop() ?? "";
          for (const line of lines) { try { const event = JSON.parse(line); status.lastEvent = event; if (event.event === "bulk.failed") lastError = event.error; void save(); } catch {} }
        });
        child.stderr.on("data", (buffer: Buffer) => process.stderr.write(buffer));
      });
      await saves;
      if (code === 0) { completed = true; break; }
      let budget = false;
      try { budget = JSON.parse(await readFile(join(directory, "publication.json"), "utf8")).status === "budget-limit"; } catch {}
      budget ||= /Publication budget reached/.test(lastError);
      if (budget || /conflict|duplicate|mismatch|differs|corrupt|obsolete|splitting|invalid|changed|readback failed/i.test(lastError) && !/HTTP 429|HTTP 5[0-9][0-9]/i.test(lastError)) {
        status.state = budget ? "budget-limit" : "needs-attention"; await save(); process.exitCode = 1; break;
      }
      status.state = "retrying"; await save();
      await new Promise(resolve => setTimeout(resolve, Math.min(30_000 * 2 ** attempt, 300_000)));
    }
    if (!completed) { if (status.state === "retrying") status.state = "failed"; await save(); process.exitCode = 1; break; }
  }
  if (!process.exitCode) { status.state = "complete"; await save(); }
} catch (error) { status.state = "failed"; await save(); console.error(error instanceof Error ? error.message : "Bulk job failed"); process.exitCode = 1; }
await saves;
