"use client";

import { Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useNetworkStatus } from "@/components/providers/network-status-provider";

export function ConnectionDot({ className }: { className?: string }) {
  const { connected, isLoading, status } = useNetworkStatus();
  const tone = connected
    ? status?.accessKeyConfigured
      ? "bg-emerald-400 text-emerald-400"
      : "bg-amber-400 text-amber-400"
    : isLoading && !status
      ? "bg-muted-foreground text-muted-foreground"
      : "bg-red-400 text-red-400";

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        tone,
        connected && "status-live",
        className,
      )}
    />
  );
}

export function ConnectionBadge({ className }: { className?: string }) {
  const { connected, isLoading, status } = useNetworkStatus();
  const label = connected
    ? status?.accessKeyConfigured
      ? "Live RPC"
      : "Public RPC"
    : isLoading && !status
      ? "Connecting"
      : "Unreachable";

  const tone = connected
    ? status?.accessKeyConfigured
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    : isLoading && !status
      ? "border-border bg-muted/40 text-muted-foreground"
      : "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";

  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", tone, className)}>
      <ConnectionDot />
      {label}
    </Badge>
  );
}

export function RealDataIndicator({ className }: { className?: string }) {
  const { connected, status } = useNetworkStatus();
  if (!connected) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            "gap-1.5 border-primary/25 bg-primary/10 font-normal text-primary",
            className,
          )}
        >
          <Database className="size-3" />
          Real data
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        Every value comes from the {status?.network.label ?? "Arkiv"} network at the block shown.
        Nothing is seeded, simulated, or cached as sample data.
      </TooltipContent>
    </Tooltip>
  );
}
