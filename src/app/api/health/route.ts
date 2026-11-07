import { connection } from "next/server";
import { heartbeat } from "@/lib/axis/queue";

export async function GET() {
  await connection();
  return Response.json({ service: "axis-api", version: 1, region: process.env.AWS_REGION ?? null, worker: await heartbeat() }, { headers: { "Cache-Control": "no-store" } });
}
