import { NextResponse } from "next/server";
import { executeArkivQuery } from "@/lib/arkiv/server/service";
import { toQueryError } from "@/lib/arkiv/server/errors";
import type { QueryErrorCode, QueryErrorDto } from "@/lib/arkiv/types";
import { isNetworkId } from "@/lib/arkiv/networks";

const MAX_QUERY_LENGTH = 2_000;
const MAX_LIMIT = 100;
const MAX_OFFSET = 1_000_000;

const STATUS_BY_CODE: Record<QueryErrorCode, number> = {
  INVALID_REQUEST: 400,
  QUERY_REJECTED: 422,
  TIMEOUT: 504,
  RATE_LIMITED: 429,
  ACCESS_DENIED: 502,
  NETWORK: 502,
  CONFIG: 500,
  CANCELLED: 408,
  INTERNAL: 500,
};

function invalid(message: string): NextResponse<{ error: QueryErrorDto }> {
  return NextResponse.json(
    {
      error: {
        code: "INVALID_REQUEST",
        message,
        retryable: false,
      } satisfies QueryErrorDto,
    },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalid("Request body must be valid JSON.");
  }

  if (!body || typeof body !== "object") {
    return invalid("Request body must be a JSON object.");
  }

  const payload = body as Record<string, unknown>;

  if (!isNetworkId(payload.network)) {
    return invalid("Unsupported Arkiv network. The official SDK currently exposes Rabdi.");
  }

  if (typeof payload.query !== "string") {
    return invalid("`query` must be a string.");
  }

  const query = payload.query.trim();
  if (query.length === 0) {
    return invalid("Enter an Arkiv query before running it.");
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return invalid(`Query exceeds the ${MAX_QUERY_LENGTH.toLocaleString()} character limit.`);
  }

  const limit = payload.limit === undefined ? 25 : payload.limit;
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > MAX_LIMIT) {
    return invalid(`\`limit\` must be an integer between 1 and ${MAX_LIMIT}.`);
  }

  const offset = payload.offset === undefined ? 0 : payload.offset;
  if (!Number.isInteger(offset) || (offset as number) < 0 || (offset as number) > MAX_OFFSET) {
    return invalid(`\`offset\` must be an integer between 0 and ${MAX_OFFSET.toLocaleString()}.`);
  }

  const count = payload.count === undefined ? true : payload.count;
  if (typeof count !== "boolean") {
    return invalid("`count` must be a boolean.");
  }

  try {
    const result = await executeArkivQuery(
      {
        network: payload.network,
        query,
        limit: limit as number,
        offset: offset as number,
        count,
      },
      request.signal,
    );

    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const mapped = toQueryError(error);
    return NextResponse.json(
      { error: mapped },
      {
        status: STATUS_BY_CODE[mapped.code] ?? 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
