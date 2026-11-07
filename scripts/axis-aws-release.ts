import nextEnv from "@next/env";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parseEnv } from "node:util";

const region = "ap-southeast-2", profile = "axis-production", stack = "axis-production-sydney";
const root = process.cwd(), working = resolve(root, ".axis/deployment");
nextEnv.loadEnvConfig(root, true, { info() {}, error() {} });
const worker = parseEnv(await readFile(join(root, ".env.worker.local"), "utf8"));
const workerKey = worker.AXIS_INDEXER_PRIVATE_KEY;
if (!workerKey || !/^0x[0-9a-fA-F]{64}$/.test(workerKey)) throw new Error("Missing worker signer in .env.worker.local.");
const forbidden = [workerKey, ...["ARKIV_ACCESS_KEY", "OPENROUTER_API_KEY", "SWARM_API_TOKEN"].map(name => process.env[name])].filter((value): value is string => Boolean(value && value.length >= 8));
const environment = { ...process.env };
for (const name of Object.keys(environment)) if (/^(ARKIV_|AXIS_|POLYGON_|OPENROUTER_|SWARM_)/.test(name)) delete environment[name];
async function run(command: string, args: string[]) {
  return new Promise<string>((accept, reject) => {
    const child = spawn(command, args, { cwd: root, env: environment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk.toString(); });
    child.stderr.on("data", chunk => { output += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? accept(output.trim()) : reject(new Error(`${command} failed (${code}): ${output.slice(0, 2000)}`)));
  });
}
const aws = (args: string[]) => run("aws", [...args, "--profile", profile, "--region", region, "--no-cli-pager"]);
await mkdir(working, { recursive: true });
const state = JSON.parse(await aws(["cloudformation", "describe-stacks", "--stack-name", stack, "--output", "json"])).Stacks[0];
if (!/^(CREATE|UPDATE)_COMPLETE$/.test(state.StackStatus)) throw new Error(`Infrastructure is not ready: ${state.StackStatus}`);
const outputs = Object.fromEntries(state.Outputs.map((entry: { OutputKey: string; OutputValue: string }) => [entry.OutputKey, entry.OutputValue]));
const apiHost = outputs.PublicIp.replaceAll(".", "-") + ".sslip.io";
const frontend = process.env.AXIS_FRONTEND_ORIGIN || "https://axis-platform-e7ac45525b.vercel.app";
const release = new Date().toISOString().replace(/[^0-9]/g, "") + "-" + randomUUID().slice(0, 8);
const directory = join(working, release);
await mkdir(directory, { recursive: true });
async function safeCopy(relative: string) {
  const data = await readFile(join(root, relative));
  if (forbidden.some(value => data.includes(Buffer.from(value)))) throw new Error(`A configured credential was found in release source: ${relative}`);
  await mkdir(resolve(directory, relative, ".."), { recursive: true });
  await writeFile(join(directory, relative), data);
}
async function copyTree(relative: string) {
  for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
    const path = relative + "/" + entry.name;
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(path)) continue;
    if (entry.isSymbolicLink()) throw new Error("Release source must not contain symbolic links.");
    if (entry.isDirectory()) await copyTree(path);
    else if (entry.isFile()) await safeCopy(path);
  }
}
await copyTree("src"); await copyTree("public");
await mkdir(join(directory, "scripts"), { recursive: true });
for (const script of ["axis-worker", "axis-renew", "axis-bulk", "axis-bulk-job"]) await safeCopy(`scripts/${script}.ts`);
for (const name of ["package.json", "package-lock.json", "next.config.ts", "tsconfig.json"]) await safeCopy(name);
await run("tar", ["-czf", directory + ".tar.gz", "-C", directory, "."]);
console.log(`Prepared credential-free release ${release}.`);
await aws(["s3", "cp", directory + ".tar.gz", `s3://${outputs.ArtifactBucket}/releases/${release}.tar.gz`, "--only-show-errors"]);
await aws(["s3", "cp", "deploy/aws/apply-release.sh", `s3://${outputs.ArtifactBucket}/deploy/apply-release.sh`, "--only-show-errors"]);

function envLine(name: string, value: string) {
  if (/[\r\n\0]/.test(value)) throw new Error(`Invalid multiline environment value for ${name}.`);
  return `${name}="${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
const apiVariables: Record<string, string> = { AWS_REGION: region, AXIS_FRONTEND_ORIGIN: frontend };
const allowedNames = ["ARKIV_ACCESS_KEY", "ARKIV_RPC_URL", "ARKIV_QUERY_TIMEOUT_MS", "POLYGON_RPC_URL", "AXIS_BULK_RPC_INTERVAL_MS", "AXIS_INDEXER_ADDRESS", "OPENROUTER_API_KEY", "OPENROUTER_MODEL", "SWARM_UPLOAD_MODE", "SWARM_SNAPSHOT_PROFILE", "SWARM_BEE_URL", "SWARM_POSTAGE_BATCH_ID", "SWARM_API_TOKEN", "SWARM_BATCH_OWNER_ADDRESS", "SWARM_BATCH_DONOR", "SWARM_UPLOAD_SERVICE_NAME", "SWARM_ALLOWED_UPLOADERS", "SWARM_READ_GATEWAY_URL", "SWARM_MAX_UPLOADS_PER_DAY"];
for (const name of allowedNames) if (process.env[name]?.trim()) apiVariables[name] = process.env[name]!.trim();
apiVariables.AXIS_DASHBOARD_VIEWER_URL = process.env.AXIS_DASHBOARD_VIEWER_URL?.trim() || JSON.parse(await readFile(join(root, ".axis/dashboard-viewer-host.json"), "utf8")).url;
for (const name of ["ARKIV_ACCESS_KEY", "POLYGON_RPC_URL", "AXIS_INDEXER_ADDRESS"]) if (!apiVariables[name]) throw new Error(`Missing server configuration: ${name}.`);
for (const [scope, values] of Object.entries({ api: apiVariables, worker: { AXIS_INDEXER_PRIVATE_KEY: workerKey } })) {
  const path = join(working, `${scope}-parameter.private.json`);
  try {
    await writeFile(path, JSON.stringify({ Name: `/axis/production/${scope}-env`, Type: "SecureString", Tier: "Standard", Overwrite: true, Value: Object.entries(values).map(([name, value]) => envLine(name, value)).join("\n") }), { mode: 0o600 });
    await aws(["ssm", "put-parameter", "--cli-input-json", "file://" + path, "--query", "Version", "--output", "text"]);
    console.log(`Configured encrypted ${scope} environment in Sydney.`);
  } finally { await rm(path, { force: true }); }
}
const command = `aws s3 cp 's3://${outputs.ArtifactBucket}/deploy/apply-release.sh' /var/lib/axis/apply-release.sh --region ${region} --only-show-errors && bash /var/lib/axis/apply-release.sh '${region}' '${outputs.ArtifactBucket}' '${release}' '${apiHost}'`;
const commandFile = join(working, "apply-command.json");
await writeFile(commandFile, JSON.stringify({ commands: [command], executionTimeout: ["3600"] }));
const commandId = await aws(["ssm", "send-command", "--instance-ids", outputs.InstanceId, "--document-name", "AWS-RunShellScript", "--comment", "Install AXIS API release; worker stays stopped until handoff", "--parameters", "file://" + commandFile, "--query", "Command.CommandId", "--output", "text"]);
const evidence = { region, profile, stack, release, instanceId: outputs.InstanceId, artifactBucket: outputs.ArtifactBucket, apiOrigin: "https://" + apiHost, frontendOrigin: frontend, commandId, startedAt: new Date().toISOString() };
await writeFile(join(working, "aws-release.json"), JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(evidence));
