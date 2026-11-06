"use client";

import * as React from "react";
import { executeArkivQuery } from "@/lib/arkiv/client-api";
import type { NetworkId } from "@/lib/arkiv/networks";
import type { QueryErrorDto, QueryRequestInput, QueryResultDto } from "@/lib/arkiv/types";

export type Freshness = "live" | "stale" | "paused" | "error" | "connecting";

type LiveState = {
  result: QueryResultDto | null;
  error: QueryErrorDto | null;
  isLoading: boolean;
  lastSuccessAt: number | null;
  lastAttemptAt: number | null;
  failureCount: number;
};

const INITIAL_STATE: LiveState = {
  result: null,
  error: null,
  isLoading: true,
  lastSuccessAt: null,
  lastAttemptAt: null,
  failureCount: 0,
};

export function useLiveQuery({
  query,
  limit,
  offset = 0,
  count = true,
  intervalMs,
  enabled = true,
  network = "rabdi",
}: {
  query: string;
  limit: number;
  offset?: number;
  count?: boolean;
  intervalMs: number;
  enabled?: boolean;
  network?: NetworkId;
}) {
  const [state, setState] = React.useState<LiveState>(INITIAL_STATE);
  const abortRef = React.useRef<AbortController | null>(null);
  const seqRef = React.useRef(0);
  const mountedRef = React.useRef(true);
  const requestRef = React.useRef<QueryRequestInput>({ network, query, limit, offset, count });

  requestRef.current = { network, query, limit, offset, count };

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const run = React.useCallback(async (): Promise<QueryResultDto | null> => {
    if (!enabled) return null;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++seqRef.current;

    setState((previous) => ({
      ...previous,
      isLoading: true,
      lastAttemptAt: Date.now(),
    }));

    try {
      const result = await executeArkivQuery(requestRef.current, controller.signal);
      if (!mountedRef.current || seq !== seqRef.current || controller.signal.aborted) return null;

      if (!result.ok) {
        setState((previous) => ({
          ...previous,
          isLoading: false,
          error: result.error,
          failureCount: previous.failureCount + 1,
          lastAttemptAt: Date.now(),
        }));
        return null;
      }

      setState({
        result: result.data,
        error: null,
        isLoading: false,
        lastSuccessAt: Date.now(),
        lastAttemptAt: Date.now(),
        failureCount: 0,
      });
      return result.data;
    } catch (error) {
      if (!mountedRef.current || seq !== seqRef.current || controller.signal.aborted) return null;
      if (error instanceof DOMException && error.name === "AbortError") return null;

      setState((previous) => ({
        ...previous,
        isLoading: false,
        error: {
          code: "NETWORK",
          message: "Could not reach the ARKIV VIZ query API.",
          detail: error instanceof Error ? error.message : undefined,
          retryable: true,
        },
        failureCount: previous.failureCount + 1,
        lastAttemptAt: Date.now(),
      }));
      return null;
    }
  }, [enabled]);

  const refresh = React.useCallback(() => {
    void run();
  }, [run]);

  React.useEffect(() => {
    if (!enabled || !query.trim()) return;

    let cancelled = false;
    let timer: number | null = null;

    const loop = async () => {
      await run();
      if (cancelled) return;
      if (intervalMs > 0) {
        timer = window.setTimeout(loop, intervalMs);
      }
    };

    void loop();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [enabled, query, limit, offset, count, intervalMs, network, run]);

  return {
    ...state,
    refresh,
    isInitialLoading: state.isLoading && state.result === null,
    isRefreshing: state.isLoading && state.result !== null,
  };
}

export function deriveFreshness(
  state: Pick<LiveState, "error" | "lastSuccessAt" | "result">,
  intervalMs: number,
  now: number,
): Freshness {
  if (!state.result && state.error) return "error";
  if (!state.result) return "connecting";
  if (state.error) return "error";
  if (intervalMs <= 0) return "paused";
  if (state.lastSuccessAt && now - state.lastSuccessAt > intervalMs * 2.5 + 5_000) return "stale";
  return "live";
}
