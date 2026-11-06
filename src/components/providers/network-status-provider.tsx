"use client";

import * as React from "react";
import { fetchArkivStatus } from "@/lib/arkiv/client-api";
import type { ArkivStatusDto, QueryErrorDto } from "@/lib/arkiv/types";

type NetworkStatusContextValue = {
  status: ArkivStatusDto | null;
  isLoading: boolean;
  error: QueryErrorDto | null;
  lastCheckedAt: number | null;
  refresh: () => void;
  connected: boolean;
  accessKeyConfigured: boolean;
};

const NetworkStatusContext = React.createContext<NetworkStatusContextValue | null>(null);

const POLL_MS = 30_000;

export function NetworkStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<ArkivStatusDto | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<QueryErrorDto | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = React.useState<number | null>(null);

  const mountedRef = React.useRef(true);
  const abortRef = React.useRef<AbortController | null>(null);
  const inFlightRef = React.useRef(false);
  const lastFetchRef = React.useRef(0);

  const refresh = React.useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);

    try {
      const result = await fetchArkivStatus(controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;

      lastFetchRef.current = Date.now();
      if (result.ok) {
        setStatus(result.data);
        setError(result.data.error);
      } else {
        setError(result.error);
      }
      setLastCheckedAt(Date.now());
    } catch (caught) {
      if (controller.signal.aborted || !mountedRef.current) return;
      setError({
        code: "NETWORK",
        message: "Could not reach the ARKIV VIZ status API.",
        detail: caught instanceof Error ? caught.message : undefined,
        retryable: true,
      });
      setLastCheckedAt(Date.now());
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        inFlightRef.current = false;
        if (mountedRef.current) setIsLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    void refresh();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);

    const onFocus = () => {
      if (Date.now() - lastFetchRef.current > 10_000) void refresh();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      abortRef.current?.abort();
      abortRef.current = null;
      inFlightRef.current = false;
    };
  }, [refresh]);

  const value = React.useMemo<NetworkStatusContextValue>(
    () => ({
      status,
      isLoading,
      error,
      lastCheckedAt,
      refresh,
      connected: status?.connected === true,
      accessKeyConfigured: status?.accessKeyConfigured === true,
    }),
    [status, isLoading, error, lastCheckedAt, refresh],
  );

  return <NetworkStatusContext.Provider value={value}>{children}</NetworkStatusContext.Provider>;
}

export function useNetworkStatus(): NetworkStatusContextValue {
  const context = React.useContext(NetworkStatusContext);
  if (!context) throw new Error("useNetworkStatus must be used inside NetworkStatusProvider");
  return context;
}
