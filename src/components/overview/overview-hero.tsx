"use client";

import Link from "next/link";
import { ArrowRight, Copy, Database, Play, Plus, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNetworkStatus } from "@/components/providers/network-status-provider";
import { useCopy } from "@/hooks/use-copy";
import { DEFAULT_QUERY } from "@/lib/arkiv/query-language";
import { formatBlock, formatDateTime, formatDuration } from "@/lib/format";

function LiveStat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
      <div className="stat-label">{label}</div>
      <div className="stat-value mt-1 truncate">{value}</div>
      {hint && <div className="mt-0.5 truncate text-[10px] text-muted-foreground/80">{hint}</div>}
    </div>
  );
}

export function OverviewHero() {
  const { status, connected, isLoading } = useNetworkStatus();
  const { copy, copiedKey } = useCopy();

  return (
    <section className="panel">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1.5 border-primary/25 bg-primary/10 font-normal text-primary"
            >
              <Database className="size-3" />
              Live Arkiv data
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              Nothing is seeded or simulated.
            </span>
          </div>

          <h2 className="mt-4 max-w-xl text-[1.375rem] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-[1.5rem]">
            Query the keyspace. Ship the dashboard.
          </h2>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            Write an Arkiv predicate, inspect the entities that actually come back, then compose a
            dashboard from the fields the network returned.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild className="gap-1.5">
              <Link href="/query">
                <Terminal className="size-4" />
                Open query builder
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-1.5">
              <Link href="/dashboards/new">
                <Plus className="size-4" />
                Create dashboard
              </Link>
            </Button>
            <Button
              variant="ghost"
              className="gap-1.5 text-muted-foreground"
              onClick={() => void copy(DEFAULT_QUERY, "Starter query copied")}
            >
              <Copy className="size-3.5" />
              {copiedKey === DEFAULT_QUERY ? "Copied" : "Copy starter query"}
            </Button>
          </div>
        </div>

        <div className="min-w-0">
          <div className="grid grid-cols-2 gap-2">
            <LiveStat
              label="Network"
              value={status?.network.label ?? "Rabdi Testnet"}
              hint={connected ? "connected" : isLoading ? "checking…" : "unreachable"}
            />
            <LiveStat
              label="Current block"
              value={connected ? formatBlock(status?.blockNumber) : "—"}
              hint={connected ? "live node head" : "no live value"}
            />
            <LiveStat
              label="RPC latency"
              value={connected ? formatDuration(status?.latencyMs) : "—"}
              hint={connected ? "last status check" : "no live value"}
            />
            <LiveStat
              label="Last checked"
              value={status ? formatDateTime(status.checkedAt) : "—"}
              hint={
                connected && status?.blockTime
                  ? `block time ${formatDateTime(status.blockTime)}`
                  : undefined
              }
            />
          </div>

          <div className="mt-2 flex items-center gap-2 rounded-lg border border-border/70 bg-background/40 px-3 py-2">
            <Play className="size-3 shrink-0 text-primary" />
            <code className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-foreground/85">
              {DEFAULT_QUERY}
            </code>
            <Button variant="ghost" size="xs" asChild className="gap-1">
              <Link href={`/query?${new URLSearchParams({ query: DEFAULT_QUERY }).toString()}`}>
                Run
                <ArrowRight className="size-3" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
