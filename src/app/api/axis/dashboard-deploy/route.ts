import { connection, NextResponse } from "next/server";
import { connectedViewer, deployDashboardWebsite } from "@/lib/axis/dashboard-deployment";
import { safeError } from "@/lib/axis/runtime";
import { mutationOrigin } from "@/lib/axis/request-origin";

const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  await connection();
  try { return json(await connectedViewer()); }
  catch (error) { return json({ error: safeError(error) }, 400); }
}
export async function POST(request: Request) {
  try {
    if (!mutationOrigin(request)) return json({ error: "Cross-origin deployment requests are not accepted." }, 403);
    const text = await request.text();
    if (text.length > 1024) return json({ error: "Request too large." }, 413);
    const body = JSON.parse(text);
    return json(await deployDashboardWebsite(body.entityKey, body.documentHash));
  } catch (error) { return json({ error: safeError(error) }, 400); }
}
