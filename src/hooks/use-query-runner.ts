"use client";

import * as React from "react";
import { executeArkivQuery } from "@/lib/arkiv/client-api";
import type { QueryErrorDto, QueryRequestInput, QueryResultDto } from "@/lib/arkiv/types";

type RunnerState = {
  status: "idle" | "loading" | "success" | "error";
  result: QueryResultDto | null;
  error: QueryErrorDto | null;
  receivedAt: number | null;
  startedAt: number | null;
};

const INITIAL_STATE: RunnerState = {
  status: "idle",
  result: null,
  error: null,
  receivedAt: null,
  startedAt: null,
};

function networkFailure(message?: string): QueryErrorDto {
  return {
    code: "NETWORK",
    message: "Could not reach the ARKIV VIZ query API.",
    detail: message,
    retryable: true,
  };
}

export function useQueryRunner() {
  const [state, setState] = React.useState<RunnerState>(INITIAL_STATE);
  const abortRef = React.useRef<AbortController | null>(null);
  const seqRef = React.useRef(0);
  const lastRequestRef = React.useRef<QueryRequestInput | null>(null);

  React.useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const run = React.useCallback(async (input: QueryRequestInput): Promise<QueryResultDto | null> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const seq = ++seqRef.current;
    lastRequestRef.current = input;

    setState((previous) => ({
      ...previous,
      status: "loading",
      error: null,
      startedAt: Date.now(),
    }));

    try {
      const result = await executeArkivQuery(input, controller.signal);
      if (seq !== seqRef.current || controller.signal.aborted) return null;

      if (!result.ok) {
        setState((previous) => ({
          ...previous,
          status: "error",
          error: result.error,
          receivedAt: Date.now(),
        }));
        return null;
      }

      setState({
        status: "success",
        result: result.data,
        error: null,
        receivedAt: Date.now(),
        startedAt: null,
      });
      return result.data;
    } catch (error) {
      if (seq !== seqRef.current || controller.signal.aborted) return null;
      if (error instanceof DOMException && error.name === "AbortError") return null;
      setState((previous) => ({
        ...previous,
        status: "error",
        error: networkFailure(error instanceof Error ? error.message : undefined),
        receivedAt: Date.now(),
        startedAt: null,
      }));
      return null;
    }
  }, []);

  const cancel = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    seqRef.current += 1;
    setState((previous) => ({
      ...previous,
      status: previous.result ? "success" : "idle",
      startedAt: null,
    }));
  }, []);

  const reset = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    seqRef.current += 1;
    lastRequestRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  const retry = React.useCallback(() => {
    const last = lastRequestRef.current;
    if (!last) return Promise.resolve(null);
    return run(last);
  }, [run]);

  return {
    state,
    run,
    cancel,
    reset,
    retry,
    isLoading: state.status === "loading",
    lastRequest: lastRequestRef.current,
  };
}
