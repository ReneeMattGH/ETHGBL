import { connection, NextResponse } from "next/server";
import { safeError } from "@/lib/axis/runtime";
import { swarmConfiguration, checkSwarmConnection, uploadQuerySnapshot, readArkivSnapshot, listArkivSnapshots, prepareSnapshotPublication } from "@/lib/axis/swarm";
import { mutationOrigin } from "@/lib/axis/request-origin";

export const maxDuration = 300;
type Context = { params: Promise<{ path: string[] }> };
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request, context: Context) {
  await connection();
  try {
    const { path } = await context.params;
    if (path.length === 1 && path[0] === "status") return json(swarmConfiguration());
    if (path.length === 1 && path[0] === "check") return json(await checkSwarmConnection());
    if (path.length === 1 && path[0] === "snapshots") {
      const url = new URL(request.url);
      return json(await listArkivSnapshots(url.searchParams.get("owner") || undefined, Number(url.searchParams.get("offset") ?? "0")));
    }
    if (path.length === 2 && path[0] === "snapshots") return json(await readArkivSnapshot(path[1]));
    return json({ error: "Unknown Swarm endpoint." }, 404);
  } catch (error) { return json({ error: safeError(error) }, 400); }
}
export async function POST(request: Request, context: Context) {
  try {
    const origin = mutationOrigin(request);
    if (!origin) return json({ error: "Cross-origin uploads are not accepted." }, 403);
    const { path } = await context.params;
    if (path.length !== 1 || !["upload", "publication"].includes(path[0])) return json({ error: "Unknown Swarm endpoint." }, 404);
    if (Number(request.headers.get("content-length") ?? 0) > 200000) return json({ error: "Request too large." }, 413);
    const text = await request.text();
    if (text.length > 200000) return json({ error: "Request too large." }, 413);
    const body = JSON.parse(text);
    if (path[0] === "publication") return json(await prepareSnapshotPublication(body.document));
    const { intent, authorization } = body;
    return json(await uploadQuerySnapshot(intent, authorization, origin));
  } catch (error) { return json({ error: safeError(error) }, 400); }
}
