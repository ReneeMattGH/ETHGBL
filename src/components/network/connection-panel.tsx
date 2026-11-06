"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, KeyRound, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QueryErrorPanel } from "@/components/query/query-error-panel";
import { ConnectionBadge } from "@/components/network/connection-badge";
import { useNetworkStatus } from "@/components/providers/network-status-provider";
import { formatBlock, formatDateTime, formatDuration } from "@/lib/format";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 py-1.5 last:border-0">
      <dt className="pt-px text-[11px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all text-right font-mono text-[11px] text-foreground">{value}</dd>
    </div>
  );
}

export function ConnectionPanel({
  showError = true,
  showSettingsLink = true,
  layout = "default",
}: {
  showError?: boolean;
  showSettingsLink?: boolean;
  layout?: "default" | "strip";
}) {
  const { status, connected, isLoading, error, refresh } = useNetworkStatus();
  const failure = status?.error ?? error;

  if (layout === "strip") {
    const stats: { label: string; value: React.ReactNode; tone?: string }[] = [
      { label: "Network", value: status?.network.label ?? "Rabdi Testnet" },
      { label: "Chain ID", value: status?.network.chainId ?? 7794095 },
      { label: "Current block", value: connected ? formatBlock(status?.blockNumber) : "—" },
      { label: "RPC latency", value: connected ? formatDuration(status?.latencyMs) : "—" },
      {
        label: "Access key",
        value:
          status === null
            ? isLoading
              ? "Checking…"
              : "Unknown"
            : status.accessKeyConfigured
              ? "Configured"
              : "Public",
        tone:
          status && status.accessKeyConfigured
            ? "text-emerald-600 dark:text-emerald-400"
            : undefined,
      },
      { label: "Query timeout", value: status ? formatDuration(status.queryTimeoutMs) : "—" },
    ];

    return (
      <section className="panel space-y-3" aria-label="Connection">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="section-title">Connection</h2>
            <span className="truncate text-[10.5px] text-muted-foreground">
              Server-side Arkiv SDK · {status?.rpcHost ?? "rabdi"} · checked{" "}
              {status ? formatDateTime(status.checkedAt) : "—"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <ConnectionBadge />
            <Button
              variant="outline"
              size="xs"
              className="gap-1.5"
              onClick={() => void refresh()}
              disabled={isLoading}
            >
              <RefreshCw className={`size-3 ${isLoading ? "animate-spin" : ""}`} />
              Re-check
            </Button>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {stats.map((item) => (
            <div
              key={item.label}
              className="min-w-0 rounded-lg border border-border/60 bg-background/40 px-3 py-2"
            >
              <dt className="stat-label">{item.label}</dt>
              <dd className={`stat-value mt-1 truncate ${item.tone ?? ""}`}>{item.value}</dd>
            </div>
          ))}
        </dl>

        {showError && failure && (
          <QueryErrorPanel
            error={failure}
            compact
            onRetry={() => void refresh()}
            title="Connection check failed"
          />
        )}

        {status && !status.accessKeyConfigured && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 text-[10.5px] leading-relaxed text-amber-800 dark:text-amber-200">
            <KeyRound className="size-3 shrink-0" />
            <span>
              Public RPC: anonymous queries are rate-limited. Set{" "}
              <code className="font-mono">ARKIV_ACCESS_KEY</code> in{" "}
              <code className="font-mono">.env.local</code> for a dedicated quota.
            </span>
            <a
              href={status.network.accessKeyUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 underline underline-offset-2"
            >
              Get a key
              <ArrowUpRight className="size-2.5" />
            </a>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
          <span className="text-[10px] text-muted-foreground">
            Block time {connected ? formatDateTime(status?.blockTime) : "—"} · polled from the
            server, never from the browser.
          </span>
          <Button variant="ghost" size="xs" asChild className="gap-1 text-muted-foreground">
            <Link href="/settings">
              Connection details
              <ArrowUpRight className="size-3" />
            </Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="section-title">Connection</h2>
          <p className="section-subtitle mt-0.5">Server-side Arkiv SDK</p>
        </div>
        <ConnectionBadge />
      </div>

      <dl className="min-h-0 flex-1">
        <Row label="Network" value={status?.network.label ?? "Rabdi Testnet"} />
        <Row label="Chain ID" value={status?.network.chainId ?? 7794095} />
        <Row
          label="RPC host"
          value={
            <span className="inline-flex items-center gap-1.5">
              {status?.rpcHost ?? "rpc.rabdi.db-chain.testnet.arkiv.network"}
              {status?.rpcUrlOverridden && (
                <Badge variant="outline" className="border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                  override
                </Badge>
              )}
            </span>
          }
        />
        <Row label="Current block" value={connected ? formatBlock(status?.blockNumber) : "—"} />
        <Row
          label="Block time"
          value={connected ? (status?.blockTime ? formatDateTime(status.blockTime) : "—") : "—"}
        />
        <Row label="Block duration" value={connected ? formatDuration(status?.blockDurationMs) : "—"} />
        <Row label="RPC latency" value={connected ? formatDuration(status?.latencyMs) : "—"} />
        <Row label="Query timeout" value={status ? formatDuration(status.queryTimeoutMs) : "—"} />
        <Row
          label="Access key"
          value={
            status === null ? (
              isLoading ? "Checking…" : "Unknown"
            ) : status.accessKeyConfigured ? (
              <span className="text-emerald-600 dark:text-emerald-400">Configured</span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">Public endpoint</span>
            )
          }
        />
        <Row label="Checked" value={status ? formatDateTime(status.checkedAt) : "—"} />
      </dl>

      {showError && failure && (
        <QueryErrorPanel
          error={failure}
          compact
          onRetry={() => void refresh()}
          title="Connection check failed"
        />
      )}

      {status && !status.accessKeyConfigured && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
          <p className="flex items-center gap-1.5 font-medium">
            <KeyRound className="size-3" />
            Running on the public RPC
          </p>
          <p className="mt-1 text-amber-800/90 dark:text-amber-200/90">
            Anonymous queries are heavily rate-limited. Set{" "}
            <code className="font-mono">ARKIV_ACCESS_KEY</code> in{" "}
            <code className="font-mono">.env.local</code> for a dedicated quota.{" "}
            <a
              href={status.network.accessKeyUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 underline underline-offset-2"
            >
              Get a key
              <ArrowUpRight className="size-2.5" />
            </a>
          </p>
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        <Button
          variant="outline"
          size="xs"
          className="gap-1.5"
          onClick={() => void refresh()}
          disabled={isLoading}
        >
          <RefreshCw className={`size-3 ${isLoading ? "animate-spin" : ""}`} />
          Re-check
        </Button>
        {showSettingsLink ? (
          <Button variant="ghost" size="xs" asChild className="gap-1 text-muted-foreground">
            <Link href="/settings">Connection settings</Link>
          </Button>
        ) : (
          <span className="text-[10px] text-muted-foreground">Read-only server status</span>
        )}
      </div>
    </section>
  );
}
