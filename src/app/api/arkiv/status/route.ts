import { connection, NextResponse } from "next/server";
import { getArkivStatus } from "@/lib/arkiv/server/service";

export async function GET() {
  // Keep the build from executing the RPC call while collecting page data.
  await connection();
  const status = await getArkivStatus();
  return NextResponse.json(status, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
