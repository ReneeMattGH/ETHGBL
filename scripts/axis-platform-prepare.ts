import { readdir, readFile, mkdir, writeFile, copyFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

// Build a separate frontend package without the backend routes, local runtime
// data, credentials, ingestion scripts or workstation configuration.
export async function preparePlatformFrontend(root = process.cwd()) {
  const parent = resolve(root, ".axis"), output = resolve(parent, "platform-frontend");
  if (!output.startsWith(parent + sep)) throw new Error("Frontend output is outside the generated workspace.");
  await mkdir(output, { recursive: true });
  // Only replace the generated source trees; retain the Vercel project link.
  for (const name of ["src", "public"]) await rm(join(output, name), { recursive: true, force: true });
  let files = 0;
  async function copyTree(relative: string) {
    for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
      const name = `${relative}/${entry.name}`;
      if (name === "src/app/api" || /\.(test|spec)\.[cm]?[jt]sx?$/.test(name)) continue;
      if (entry.isSymbolicLink()) throw new Error("Frontend source must not contain symbolic links.");
      if (entry.isDirectory()) await copyTree(name);
      else if (entry.isFile()) {
        await mkdir(resolve(output, name, ".."), { recursive: true });
        await copyFile(join(root, name), join(output, name)); files++;
      }
    }
  }
  await copyTree("src"); await copyTree("public");
  for (const name of ["next.config.ts", "tsconfig.json", "package-lock.json"]) await copyFile(join(root, name), join(output, name));
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  pkg.scripts = { dev: "next dev", build: "next build", start: "next start", typecheck: "tsc --noEmit" };
  await writeFile(join(output, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  await writeFile(join(output, ".vercelignore"), "node_modules\n.next\n.env*\n*.tsbuildinfo\nnext-env.d.ts\n");
  await writeFile(join(output, "vercel.json"), JSON.stringify({ regions: ["syd1"] }, null, 2) + "\n");
  const health = join(output, "src/app/api/health/route.ts");
  await mkdir(resolve(health, ".."), { recursive: true });
  await writeFile(health, 'export function GET() { return Response.json({ service: "axis-platform", version: 1 }); }\n');
  return { directory: output, files };
}

const result = await preparePlatformFrontend();
console.log(`Prepared ${result.files} frontend files in ${result.directory}`);
