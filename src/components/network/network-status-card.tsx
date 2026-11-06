"use client";

import Link from "next/link";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConnectionDot } from "@/components/network/connection-badge";
import { useNetworkStatus } from "@/components/providers/network-status-provider";
import { formatBlock, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-sidebar-border/70 bg-background/40 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="tabular mt-0.5 text-[11.5px] font-medium text-foreground">{value}</div>
    </div>
  );
}

export function NetworkStatusCard({ className }: { className?: string }) {
  const { status, connected, isLoading, error, refresh } = useNetworkStatus();

  return (
    <div className={cn("rounded-xl border border-sidebar-border bg-card/50 p-3", className)}>
      <div className="flex items-center justify-between">
        <span className="eyebrow">Network</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={isLoading}
              aria-label="Re-check Arkiv connection"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground disabled:opacity-60"
            >
              <RefreshCw className={cn("size-3", isLoading && "animate-spin")} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Re-check the Arkiv RPC connection</TooltipContent>
        </Tooltip>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <ConnectionDot />
        <span className="text-xs font-medium text-foreground">
          {status?.network.label ?? "Rabdi Testnet"}
        </span>
        <Badge
          variant="outline"
          className="ml-auto h-4 border-border/70 px-1.5 text-[9px] font-normal text-muted-foreground"
        >
          Testnet
        </Badge>
      </div>

      {connected ? (
        <>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            <MiniStat label="Block" value={formatBlock(status?.blockNumber)} />
            <MiniStat label="Latency" value={formatDuration(status?.latencyMs)} />
          </div>
          <p
            className={cn(
              "mt-2.5 border-t border-sidebar-border pt-2 text-[10.5px] leading-relaxed",
              status?.accessKeyConfigured ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400",
            )}
          >
            {status?.accessKeyConfigured
              ? "Access key configured · higher RPC limits"
              : "Public endpoint · rate-limited. Add an access key."}
          </p>
        </>
      ) : (
        <p className="mt-2.5 border-t border-sidebar-border pt-2 text-[10.5px] leading-relaxed text-muted-foreground">
          {isLoading
            ? "Checking the Arkiv RPC connection…"
            : (error?.message ?? "No connection to Arkiv.")}
        </p>
      )}

      <Link
        href="/settings"
        className="mt-2 inline-flex items-center gap-1 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        Connection settings
        <ArrowUpRight className="size-3" />
      </Link>
    </div>
  );
}
