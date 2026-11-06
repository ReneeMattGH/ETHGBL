import type {
  ApiResult,
  ArkivStatusDto,
  QueryErrorDto,
  QueryRequestInput,
  QueryResultDto,
} from "./types";

function networkError(detail?: string): QueryErrorDto {
  return {
    code: "NETWORK",
    message: "Could not reach the ARKIV VIZ server. Check that the app is running and try again.",
    detail,
    retryable: true,
  };
}

async function read<T>(response: Response): Promise<ApiResult<T>> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // The response body was not JSON.
  }

  if (!response.ok) {
    const error =
      payload && typeof payload === "object" && "error" in payload
        ? (payload as { error: QueryErrorDto }).error
        : networkError(`HTTP ${response.status} ${response.statusText}`);
    return { ok: false, error };
  }

  return { ok: true, data: payload as T };
}

export async function fetchArkivStatus(signal?: AbortSignal): Promise<ApiResult<ArkivStatusDto>> {
  try {
    const response = await fetch("/api/arkiv/status", {
      signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    return read<ArkivStatusDto>(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { ok: false, error: networkError(error instanceof Error ? error.message : undefined) };
  }
}

export async function executeArkivQuery(
  input: QueryRequestInput,
  signal?: AbortSignal,
): Promise<ApiResult<QueryResultDto>> {
  try {
    const response = await fetch("/api/arkiv/query", {
      method: "POST",
      signal,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(input),
    });
    return read<QueryResultDto>(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { ok: false, error: networkError(error instanceof Error ? error.message : undefined) };
  }
}
