"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Braces,
  ChevronDown,
  CircleStop,
  Eraser,
  Info,
  Play,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ConnectionBadge } from "@/components/network/connection-badge";
import { useNetworkStatus } from "@/components/providers/network-status-provider";
import { useQueryRunner } from "@/hooks/use-query-runner";
import { DEFAULT_QUERY, QUERY_EXAMPLES, appendPredicate, roughQueryError } from "@/lib/arkiv/query-language";
import { NETWORK_OPTIONS, SUPPORTED_NETWORKS_NOTE, type NetworkId } from "@/lib/arkiv/networks";
import { inferFields } from "@/lib/visualization/fields";
import { FilterComposer } from "./filter-composer";
import { QueryHelpDialog } from "./query-help-dialog";
import { QueryEditor } from "./query-editor";
import { ResultsInspector } from "./results-inspector";
import { ResultsPanel } from "./results-panel";

const LIMIT_OPTIONS = [10, 25, 50, 100];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
      {children}
    </label>
  );
}

export function QueryWorkbench({
  initialQuery,
  initialLimit,
}: {
  initialQuery?: string;
  initialLimit?: number;
}) {
  const router = useRouter();
  const networkStatus = useNetworkStatus();
  const runner = useQueryRunner();
  const { state, run, cancel, reset, isLoading } = runner;

  const [network, setNetwork] = React.useState<NetworkId>("rabdi");
  const [query, setQuery] = React.useState(initialQuery?.trim() || DEFAULT_QUERY);
  const [limit, setLimit] = React.useState(
    initialLimit && LIMIT_OPTIONS.includes(initialLimit) ? initialLimit : 25,
  );
  const [count, setCount] = React.useState(true);
  const [offset, setOffset] = React.useState(0);
  const [validationError, setValidationError] = React.useState<string | null>(null);

  const execute = React.useCallback(
    (nextOffset = 0) => {
      const trimmed = query.trim();
      const rough = roughQueryError(trimmed);
      if (rough) {
        setValidationError(rough);
        return;
      }
      setValidationError(null);
      setOffset(nextOffset);
      void run({ network, query: trimmed, limit, offset: nextOffset, count });
    },
    [query, network, limit, count, run],
  );

  React.useEffect(() => {
    execute(0);
    // Run the default (or deep-linked) query once on mount against the live node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fields = React.useMemo(() => inferFields(state.result?.entities ?? []), [state.result]);
  const queryDirty = state.result !== null && state.result.executedQuery !== query.trim();

  const handleLimitChange = (next: string) => {
    const value = Number(next);
    setLimit(value);
    if (state.result) {
      setOffset(0);
      void run({ network, query: query.trim(), limit: value, offset: 0, count });
    }
  };

  const handleCountChange = (next: boolean) => {
    setCount(next);
    if (state.result) {
      void run({ network, query: query.trim(), limit, offset, count: next });
    }
  };

  const handleClear = () => {
    cancel();
    reset();
    setQuery("");
    setOffset(0);
    setValidationError(null);
  };

  const handleCreateDashboard = () => {
    const params = new URLSearchParams({
      network,
      query: query.trim(),
      limit: String(limit),
    });
    router.push(`/dashboards/new?${params.toString()}`);
  };

  const publicRpcWarning =
    networkStatus.status !== null && !networkStatus.accessKeyConfigured && networkStatus.connected;

  return (
    <div className="space-y-5">
      {publicRpcWarning && (
        <div className="flex flex-wrap items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3.5 py-2.5 text-[12px] leading-relaxed text-amber-800 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <p>
            Requests run on the shared public RPC and are rate-limited. Add an{" "}
            <code className="font-mono">ARKIV_ACCESS_KEY</code> server environment variable to use a
            dedicated quota.
          </p>
        </div>
      )}

      <section className="panel" aria-label="Query settings">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_auto] lg:items-end">
          <div>
            <FieldLabel>Network</FieldLabel>
            <Select value={network} onValueChange={(value) => setNetwork(value as NetworkId)}>
              <SelectTrigger className="w-full" aria-label="Arkiv network">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NETWORK_OPTIONS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    <span className="flex items-center gap-2">
                      {option.label}
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {option.chainId}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
              {SUPPORTED_NETWORKS_NOTE}
            </p>
          </div>

          <div>
            <FieldLabel>Page size</FieldLabel>
            <Select value={String(limit)} onValueChange={handleLimitChange}>
              <SelectTrigger className="w-full" aria-label="Page size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIMIT_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option} rows
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[10px] text-muted-foreground">Node max 100</p>
          </div>

          <div>
            <FieldLabel>Total count</FieldLabel>
            <div className="flex h-8 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5">
              <Switch
                id="count-projection"
                checked={count}
                onCheckedChange={handleCountChange}
                aria-label="Request total match count"
              />
              <label htmlFor="count-projection" className="text-[11.5px] text-muted-foreground">
                {count ? "Requested" : "Off"}
              </label>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">Node-reported total</p>
          </div>

          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1 lg:justify-end">
            <ConnectionBadge />
            <QueryHelpDialog />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Sparkles className="size-3.5" />
                  Examples
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Verified query patterns
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {QUERY_EXAMPLES.map((example) => (
                  <DropdownMenuItem
                    key={example.label}
                    className="flex-col items-start gap-1 py-2"
                    onClick={() => {
                      setQuery(example.query);
                      setValidationError(null);
                    }}
                  >
                    <span className="text-[12px] font-medium text-foreground">{example.label}</span>
                    <span className="text-[11px] leading-snug text-muted-foreground">
                      {example.description}
                    </span>
                    <code className="mt-0.5 line-clamp-1 font-mono text-[10px] text-primary/80">
                      {example.query}
                    </code>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </section>

      <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <section className="panel flex flex-col gap-3" aria-label="Query editor">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Braces className="size-3.5 text-primary" />
              <h2 className="section-title">Query editor</h2>
              <Badge variant="outline" className="font-mono text-[9px]">
                arkiv_query
              </Badge>
            </div>
            {queryDirty && (
              <span className="text-[10.5px] text-amber-700 dark:text-amber-300">
                Editor differs from result
              </span>
            )}
          </div>

          <QueryEditor
            value={query}
            onChange={(next) => {
              setQuery(next);
              setValidationError(null);
            }}
            onSubmit={() => execute(0)}
          />

          {validationError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/[0.05] px-3 py-2 text-[11.5px] text-red-700 dark:text-red-300"
            >
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
              <Info className="size-3" />
              <kbd className="rounded border border-border/70 bg-muted/50 px-1 py-0.5 font-mono text-[9.5px]">
                ⌘/Ctrl + Enter
              </kbd>
              to execute
            </p>
            <div className="flex items-center gap-1.5">
              {isLoading ? (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={cancel}>
                  <CircleStop className="size-3.5" />
                  Cancel
                </Button>
              ) : (
                <Button size="sm" className="gap-1.5" onClick={() => execute(0)}>
                  <Play className="size-3.5" />
                  Execute query
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={handleClear}
              >
                <Eraser className="size-3.5" />
                Clear
              </Button>
            </div>
          </div>

          <div className="border-t border-border/60 pt-3">
            <FilterComposer
              fields={fields}
              disabled={isLoading}
              onAdd={(predicate) => {
                setQuery((current) => appendPredicate(current, predicate));
                setValidationError(null);
              }}
            />
          </div>
        </section>

        <ResultsInspector
          status={state.status}
          result={state.result}
          error={state.error}
          fields={fields}
          onRetry={() => execute(offset)}
          onCreateDashboard={handleCreateDashboard}
        />
      </div>

      <section aria-label="Query result details" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="section-title">Result details</h2>
            <p className="section-subtitle mt-0.5">
              Entity table, schema inspector and request metadata.
            </p>
          </div>
        </div>

        <ResultsPanel
          status={state.status}
          result={state.result}
          error={state.error}
          queryDirty={queryDirty}
          onRetry={() => execute(offset)}
          onPageChange={(nextOffset) => execute(nextOffset)}
        />
      </section>
    </div>
  );
}
