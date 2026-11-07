import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const directory = process.cwd() + "/.axis/platform-frontend";
const { values } = parseArgs({ options: { "api-origin": { type: "string" } } });
const apiOrigin: string = values["api-origin"] ?? JSON.parse(await readFile(".axis/deployment/aws-release.json", "utf8")).apiOrigin;
if (!/^https:\/\/[a-z0-9.-]+$/.test(apiOrigin)) throw new Error("A valid Sydney API origin is required.");
const environment = { ...process.env };
for (const name of Object.keys(environment)) if (/^(ARKIV_|AXIS_|POLYGON_|OPENROUTER_|SWARM_)/.test(name)) delete environment[name];
async function vercel(args: string[], input?: string) {
  return new Promise<string>((accept, reject) => {
    const command = process.platform === "win32" ? "cmd.exe" : "npx";
    const argv = process.platform === "win32" ? ["/d", "/s", "/c", "npx.cmd", "--yes", "vercel", ...args] : ["--yes", "vercel", ...args];
    const child = spawn(command, argv, { cwd: directory, env: environment, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk.toString(); process.stdout.write(chunk); }); child.stderr.on("data", chunk => { output += chunk.toString(); process.stderr.write(chunk); });
    child.on("error", reject); child.on("close", code => code === 0 ? accept(output) : reject(new Error(output.slice(-4000))));
    child.stdin.end(input === undefined ? undefined : input + "\n");
  });
}
console.log("Setting the frontend API destination (no provider or signer credentials are uploaded to Vercel).");
await vercel(["env", "add", "AXIS_API_ORIGIN", "--environment", "production", "--force", "--yes"], apiOrigin);
console.log("Building and publishing the Vercel platform frontend...");
const output = await vercel(["deploy", "--prod", "--yes"]);
const aliases = [...output.matchAll(/Aliased\s*:?\s*(https:\/\/[^\s]+)/g)];
const urls = [...output.matchAll(/https:\/\/[a-z0-9.-]+\.vercel\.app/g)];
const frontendOrigin = (aliases.at(-1)?.[1] ?? urls.at(-1)?.[0])?.replace(/\/$/, "");
if (!frontendOrigin) throw new Error("Vercel did not return a public frontend URL.");
await writeFile(".axis/deployment/platform-host.json", JSON.stringify({ frontendOrigin, apiOrigin, deployedAt: new Date().toISOString() }, null, 2) + "\n");
console.log(`Platform frontend: ${frontendOrigin}`);
