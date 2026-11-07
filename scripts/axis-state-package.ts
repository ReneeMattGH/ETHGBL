import { mkdir, readdir, readFile, writeFile, copyFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

const root = process.cwd(), source = join(root, ".axis");
const directory = resolve(source, "deployment/state-" + randomUUID());
await mkdir(directory, { recursive: true });
let count = 0, bytes = 0;
async function copy(relative: string) {
  const from = join(source, relative), target = join(directory, relative);
  const info = await stat(from);
  await mkdir(resolve(target, ".."), { recursive: true });
  await copyFile(from, target); count++; bytes += info.size;
}
const entries = await readdir(source, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isFile() || !/^(?:jobs|nonces|swarm-uploads|swarm-last-receipt|swarm-proof|dashboard-viewer-host|source-alert-0x[0-9a-f]{64})\.json$/i.test(entry.name)) continue;
  JSON.parse(await readFile(join(source, entry.name), "utf8"));
  await copy(entry.name);
}
async function copyTree(relative: string) {
  for (const entry of await readdir(join(source, relative), { withFileTypes: true })) {
    const path = relative + "/" + entry.name;
    if (/\.lock(?:\.|$)|\.tmp(?:\.|$)/.test(entry.name) || entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await copyTree(path);
    else if (entry.isFile()) {
      if (relative === "bulk-jobs" && entry.name.endsWith(".json")) {
        const status = JSON.parse(await readFile(join(source, path), "utf8"));
        delete status.pid;
        if (["running", "retrying"].includes(status.state)) status.state = "stopped";
        await mkdir(join(directory, "bulk-jobs"), { recursive: true });
        await writeFile(join(directory, path), JSON.stringify(status, null, 2)); count++;
      } else await copy(path);
    }
  }
}
for (const name of ["bulk", "bulk-jobs"]) if (entries.some(entry => entry.isDirectory() && entry.name === name)) await copyTree(name);
const archive = directory + ".tar.gz";
await new Promise<void>((accept, reject) => {
  const child = spawn("tar", ["-czf", archive, "-C", directory, "."], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  let error = ""; child.stderr.on("data", part => { error += part.toString(); });
  child.on("error", reject); child.on("close", code => code === 0 ? accept() : reject(new Error(error)));
});
const checksum = createHash("sha256").update(await readFile(archive)).digest("hex");
const evidence = { archive, sha256: checksum, files: count, sourceBytes: bytes, archiveBytes: (await stat(archive)).size, packagedAt: new Date().toISOString() };
await writeFile(join(source, "deployment/state-package.json"), JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(evidence));
