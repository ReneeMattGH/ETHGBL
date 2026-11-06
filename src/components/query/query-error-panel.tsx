"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { QueryErrorDto } from "@/lib/arkiv/types";

const CODE_HINT: Record<string, string> = {
  INVALID_REQUEST: "The request was rejected before it reached Arkiv.",
  QUERY_REJECTED: "The Arkiv node rejected this query. Check attribute names, literal types and ORDER BY syntax.",
  TIMEOUT: "The node did not answer within the configured timeout.",
  RATE_LIMITED: "The RPC endpoint is throttling requests. Configure an Arkiv access key for a dedicated quota.",
  ACCESS_DENIED: "The RPC endpoint refused this access key.",
  NETWORK: "The request could not complete against the Arkiv RPC endpoint.",
  CONFIG: "The server integration is missing required configuration.",
  CANCELLED: "The request was cancelled.",
  INTERNAL: "The server hit an unexpected error while processing the query.",
};

export function QueryErrorPanel({
  error,
  onRetry,
  title = "Query failed",
  compact,
}: {
  error: QueryErrorDto;
  onRetry?: () => void;
  title?: string;
  compact?: boolean;
}) {
  return (
    <Alert
      variant="destructive"
      className="border-red-500/25 bg-red-500/[0.04] dark:bg-red-500/[0.06]"
    >
      <AlertTriangle />
      <AlertTitle className="flex flex-wrap items-center gap-2">
        {title}
        <Badge
          variant="outline"
          className="border-red-500/30 font-mono text-[10px] text-red-700 dark:text-red-300"
        >
          {error.code}
        </Badge>
        {error.kind && (
          <span className="font-mono text-[10px] font-normal text-red-700/70 dark:text-red-300/70">
            kind: {error.kind}
          </span>
        )}
      </AlertTitle>
      <AlertDescription className="space-y-1.5">
        <p className="text-[12.5px]">{error.message}</p>
        {!compact && error.detail && (
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border border-red-500/20 bg-background/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {error.detail}
          </pre>
        )}
        <p className="text-[11px] text-muted-foreground">
          {CODE_HINT[error.code] ?? CODE_HINT.INTERNAL}
          {error.retryable ? " This error is retryable." : ""}
        </p>
        {onRetry && (
          <div className="pt-1">
            <Button
              size="xs"
              variant="secondary"
              className="gap-1.5"
              onClick={onRetry}
              disabled={!error.retryable}
            >
              <RotateCw className="size-3" />
              Retry last request
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
