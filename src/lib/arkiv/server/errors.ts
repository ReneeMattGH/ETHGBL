import "server-only";

import { QueryError } from "@arkiv-network/sdk/query";
import { ArkivConfigurationError, arkivRpcUrl, queryTimeoutMs } from "./client";
import type { QueryErrorDto } from "../types";

const accessKey = process.env.ARKIV_ACCESS_KEY?.trim() ?? "";

function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}/[redacted]`;
  } catch {
    return "[redacted RPC URL]";
  }
}

/** Strip anything that could carry the RPC access key into a client-visible message. */
export function redactSecrets(input: string): string {
  let output = input;

  if (accessKey) {
    output = output.split(accessKey).join("[redacted]");
  }

  if (arkivRpcUrl) {
    output = output.split(arkivRpcUrl).join(redactUrl(arkivRpcUrl));
    try {
      const path = new URL(arkivRpcUrl).pathname;
      if (path.length > 1) output = output.split(path).join("/[redacted]");
    } catch {
      // The configured URL was already validated, so this is unreachable in practice.
    }
  }

  output = output.replace(/https?:\/\/rpc\.[^\s"'`/]+arkiv\.network[^\s"'`)]*/g, (match) =>
    redactUrl(match),
  );

  return output.replace(/https?:\/\/rpc\.rabdi[^\s"'`)]+/g, "https://rpc.rabdi[redacted]");
}

function stringifyData(data: unknown): string | undefined {
  if (data === undefined || data === null) return undefined;
  if (typeof data === "string") return redactSecrets(data);
  try {
    return redactSecrets(JSON.stringify(data));
  } catch {
    return undefined;
  }
}

function readStatus(error: unknown): number | undefined {
  const candidate = error as { status?: unknown; response?: { status?: unknown } };
  if (typeof candidate?.status === "number") return candidate.status;
  if (typeof candidate?.response?.status === "number") return candidate.response.status;
  return undefined;
}

function readMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function describeQueryError(error: QueryError): string {
  switch (error.kind) {
    case "parse":
      return "Arkiv rejected the query: the query string could not be parsed.";
    case "type":
      return "Arkiv rejected the query: a predicate is ill-typed for its attribute.";
    case "literal":
      return "Arkiv rejected the query: a literal is outside the valid range or format.";
    case "limits":
      return "Arkiv rejected the query: it exceeded a node limit (length, predicates, nesting, or bitmap operations).";
    default:
      return "Arkiv rejected the query.";
  }
}

export function toQueryError(error: unknown): QueryErrorDto {
  if (error instanceof ArkivConfigurationError) {
    return {
      code: "CONFIG",
      message: error.message,
      retryable: false,
    };
  }

  if (error instanceof QueryError) {
    const data = stringifyData(error.data);
    const position =
      error.data && typeof error.data === "object" && "position" in error.data
        ? ` Position ${String((error.data as { position: unknown }).position)}.`
        : "";
    return {
      code: "QUERY_REJECTED",
      kind: error.kind,
      message: describeQueryError(error),
      detail: redactSecrets(`${error.message}${position}${data ? `\n${data}` : ""}`),
      retryable: false,
    };
  }

  const name = error instanceof Error ? error.name : "";
  const message = readMessage(error);
  const status = readStatus(error);

  if (name === "AbortError" || /aborted|cancelled/i.test(message)) {
    return {
      code: "CANCELLED",
      message: "The query was cancelled.",
      retryable: true,
    };
  }

  if (name === "TimeoutError" || /timed out|timeout/i.test(message)) {
    return {
      code: "TIMEOUT",
      message: `The Arkiv node did not respond within ${Math.round(queryTimeoutMs / 1000)} seconds.`,
      detail: redactSecrets(message),
      retryable: true,
    };
  }

  if (status === 429) {
    return {
      code: "RATE_LIMITED",
      message:
        "Arkiv's RPC rate-limited this request. Add an ARKIV_ACCESS_KEY on the server for a higher limit, then retry.",
      detail: redactSecrets(message),
      retryable: true,
    };
  }

  if (status === 401 || status === 403) {
    return {
      code: "ACCESS_DENIED",
      message:
        "The Arkiv RPC rejected the access key. Check ARKIV_ACCESS_KEY and make sure the key is allowed for this origin or IP.",
      detail: redactSecrets(message),
      retryable: false,
    };
  }

  if (/fetch failed|failed to fetch|ENOTFOUND|ECONNREFUSED|network/i.test(message)) {
    return {
      code: "NETWORK",
      message: "Could not reach the Arkiv RPC endpoint from the server.",
      detail: redactSecrets(message),
      retryable: true,
    };
  }

  return {
    code: "INTERNAL",
    message: "The Arkiv request failed unexpectedly.",
    detail: redactSecrets(message),
    retryable: true,
  };
}
