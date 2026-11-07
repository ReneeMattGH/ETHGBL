import nextEnv from "@next/env";
import { spawn } from "node:child_process";
import { prepareDashboardViewer } from "../src/lib/axis/viewer-package";
import { writeState } from "../src/lib/axis/queue";
import { safeError } from "../src/lib/axis/runtime";

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const writer = process.env.AXIS_INDEXER_ADDRESS?.trim();
if (!writer || !/^0x[0-9a-fA-F]{40}$/.test(writer) || !process.env.ARKIV_ACCESS_KEY?.trim()) throw new Error("Configure ARKIV_ACCESS_KEY and AXIS_INDEXER_ADDRESS in the local AXIS server before hosting the viewer.");
const project = "axis-reports-" + writer.slice(2, 12).toLowerCase();
const prepared = await prepareDashboardViewer();
const childEnvironment = { ...process.env };
// Keep local ingestion/provider credentials out of the CLI process. Only the
// explicit read-only variables below are uploaded to Vercel through stdin.
for (const name of Object.keys(childEnvironment)) if (/^(ARKIV_|AXIS_|POLYGON_|OPENROUTER_|SWARM_)/.test(name)) delete childEnvironment[name];
async function vercel(args: string[], input?: string) {
  return new Promise<string>((resolve, reject) => {
    const command = process.platform === "win32" ? "cmd.exe" : "npx";
    const argv = process.platform === "win32" ? ["/d", "/s", "/c", "npx.cmd", "--yes", "vercel", ...args] : ["--yes", "vercel", ...args];
    const child = spawn(command, argv, { cwd: prepared.directory, env: childEnvironment, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    const append = (part: Buffer) => { output += part.toString(); };
    child.stdout.on("data", append); child.stderr.on("data", append);
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(output.replace(/\u001b\[[0-9;]*m/g, "")) : reject(new Error(safeError(output))));
    child.stdin.end(input === undefined ? undefined : input + "\n");
  });
}
console.log("Checking Vercel sign-in...");
await vercel(["whoami"]);
console.log(`Connecting the separate viewer project ${project}...`);
await vercel(["link", "--yes", "--project", project]);
for (const name of ["ARKIV_ACCESS_KEY", "AXIS_INDEXER_ADDRESS", "ARKIV_RPC_URL"] as const) {
  const value = process.env[name]?.trim();
  if (!value) continue;
  console.log(`Configuring server-only ${name}...`);
  await vercel(["env", "add", name, "--environment", "production", "--sensitive", "--force", "--yes"], value);
}
console.log("Deploying the dashboard-only website to Vercel...");
const output = await vercel(["deploy", "--prod", "--yes"]);
const production = output.match(/"productionUrl":\s*"(https:\/\/[a-z0-9.-]+)"/);
const aliases = [...output.matchAll(/Aliased\s*:?\s*(https:\/\/[^\s]+)/g)];
const urls = [...output.matchAll(/https:\/\/[a-z0-9.-]+\.vercel\.app/g)];
const url = (production?.[1] ?? aliases.at(-1)?.[1] ?? urls.at(-1)?.[0])?.replace(/\/$/, "");
if (!url || new URL(url).protocol !== "https:") throw new Error("Vercel did not return a public website URL.");
const health = await fetch(url + "/api/health", { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30000) });
if (!health.ok || (await health.json()).service !== "axis-dashboard-viewer") throw new Error("The viewer was built but its production URL is not anonymously accessible. Check Vercel deployment protection before sharing it.");
await writeState("dashboard-viewer-host", { url, project, verifiedAt: new Date().toISOString() });
console.log(`Public dashboard viewer verified: ${url}`);
console.log("The local AXIS Deploy button is now connected. Every dashboard uses this viewer with its own /d/<entity-key> link.");
