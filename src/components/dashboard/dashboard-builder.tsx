"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AreaChart as AreaChartIcon,
  ArrowLeft,
  BarChart3,
  Check,
  CircleStop,
  Gauge,
  Info,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Play,
  Plus,
  Save,
  Sparkles,
  Table2,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QueryEditor } from "@/components/query/query-editor";
import { QueryErrorPanel } from "@/components/query/query-error-panel";
import { DatasetPreview } from "@/components/dashboard/dataset-preview";
import { DashboardWidget, WIDGET_WIDTH_CLASS } from "@/components/dashboard/dashboard-widget";
import { useNetworkStatus } from "@/components/providers/network-status-provider";
import { useSettings } from "@/components/providers/settings-provider";
import { useQueryRunner } from "@/hooks/use-query-runner";
import type { NetworkId } from "@/lib/arkiv/networks";
import { DEFAULT_QUERY, roughQueryError } from "@/lib/arkiv/query-language";
import { saveDashboard } from "@/lib/dashboard/store";
import {
  AGGREGATION_LABELS,
  createId,
  VISUALIZATION_META,
  type Aggregation,
  type DashboardConfig,
  type VisualizationType,
  type WidgetConfig,
} from "@/lib/dashboard/types";
import { REFRESH_INTERVALS, formatRefreshInterval } from "@/lib/settings";
import { getField, inferFields, type DatasetField } from "@/lib/visualization/fields";
import { recommendWidgets } from "@/lib/visualization/recommend";
import { formatInteger } from "@/lib/format";

const LIMIT_OPTIONS = [25, 50, 100];

const TYPE_ICONS: Record<VisualizationType, React.ComponentType<{ className?: string }>> = {
  metric: Gauge,
  line: LineChartIcon,
  bar: BarChart3,
  area: AreaChartIcon,
  pie: PieChartIcon,
  table: Table2,
};

const TYPE_ORDER: VisualizationType[] = ["metric", "line", "bar", "area", "pie", "table"];

const WORKFLOW_STEPS = [
  "Name",
  "Query",
  "Inspect",
  "Visualize",
  "Customize",
  "Save",
] as const;

function WorkflowStepper({ completed }: { completed: boolean[] }) {
  const active = completed.findIndex((done) => !done);
  return (
    <ol className="panel flex flex-wrap items-center gap-x-1 gap-y-2 overflow-x-auto">
      {WORKFLOW_STEPS.map((step, index) => {
        const done = completed[index];
        const current = active === index;
        return (
          <React.Fragment key={step}>
            {index > 0 && (
              <span
                aria-hidden="true"
                className={`hidden h-px min-w-3 flex-1 sm:block ${done ? "bg-primary/50" : "bg-border"}`}
              />
            )}
            <li className="flex items-center gap-1.5">
              <span
                className={`flex size-5 items-center justify-center rounded-full border text-[9px] font-semibold ${
                  done
                    ? "border-primary bg-primary text-primary-foreground"
                    : current
                      ? "border-primary/60 text-primary"
                      : "border-border text-muted-foreground"
                }`}
              >
                {done ? <Check className="size-3" /> : index + 1}
              </span>
              <span
                className={`text-[11px] font-medium ${
                  done || current ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {step}
              </span>
            </li>
          </React.Fragment>
        );
      })}
    </ol>
  );
}

function defaultWidth(type: VisualizationType): 1 | 2 | 3 {
  if (type === "metric" || type === "pie") return 1;
  if (type === "table") return 3;
  return 2;
}

function incompatibleReason(type: VisualizationType, fields: DatasetField[], entityCount: number): string | null {
  const numeric = fields.filter((field) => field.numeric && field.presentCount > 0);
  const categorical = fields.filter((field) => field.categorical && field.presentCount > 0);

  if (entityCount === 0) {
    return type === "metric" ? null : "The query returned no entities.";
  }
  if ((type === "line" || type === "area") && numeric.length === 0) {
    return "Needs at least one numeric field in the returned entities.";
  }
  if ((type === "bar" || type === "pie") && categorical.length === 0) {
    return "Needs at least one categorical field (str, bool, addr or key) in the returned entities.";
  }
  return null;
}

function widgetIssue(
  widget: WidgetConfig,
  fields: DatasetField[],
  entityCount: number,
): string | null {
  if (entityCount === 0) return `${VISUALIZATION_META[widget.type].label}: no entities returned.`;
  if (widget.type === "metric") {
    if (!widget.metricField) return null;
    const field = getField(fields, widget.metricField);
    if (!field) return `Metric field ${widget.metricField} is missing from the current result.`;
    if (!field.numeric) return `Metric field ${widget.metricField} is not numeric.`;
    return null;
  }
  if (widget.type === "table") return null;

  if (widget.type === "line" || widget.type === "area") {
    const x = getField(fields, widget.xField);
    if (!x) return `${VISUALIZATION_META[widget.type].label}: X axis field is missing.`;
    if (!x.numeric) return `${VISUALIZATION_META[widget.type].label}: X axis must be numeric.`;
    if (widget.aggregation !== "count") {
      const y = getField(fields, widget.yField);
      if (!y) return `${VISUALIZATION_META[widget.type].label}: measure field is missing.`;
      if (!y.numeric) return `${VISUALIZATION_META[widget.type].label}: measure must be numeric.`;
    }
    return null;
  }

  const group = getField(fields, widget.groupField);
  if (!group) return `${VISUALIZATION_META[widget.type].label}: group field is missing.`;
  if (!group.categorical) return `${VISUALIZATION_META[widget.type].label}: group field must be categorical.`;
  if (widget.aggregation !== "count") {
    const y = getField(fields, widget.yField);
    if (!y) return `${VISUALIZATION_META[widget.type].label}: measure field is missing.`;
    if (!y.numeric) return `${VISUALIZATION_META[widget.type].label}: measure must be numeric.`;
  }
  return null;
}

export function DashboardBuilder({
  initialQuery,
  initialLimit,
  editing,
}: {
  initialQuery?: string;
  initialLimit?: number;
  editing?: DashboardConfig;
}) {
  const router = useRouter();
  const networkStatus = useNetworkStatus();
  const { settings } = useSettings();
  const runner = useQueryRunner();
  const { state, run, cancel, reset, isLoading } = runner;
  const isEditing = Boolean(editing);

  const [network, setNetwork] = React.useState<NetworkId>(editing?.network ?? "rabdi");
  const [name, setName] = React.useState(editing?.name ?? "");
  const [query, setQuery] = React.useState(
    editing?.query.text.trim() || initialQuery?.trim() || DEFAULT_QUERY,
  );
  const [limit, setLimit] = React.useState(
    editing?.query.limit && LIMIT_OPTIONS.includes(editing.query.limit)
      ? editing.query.limit
      : initialLimit && LIMIT_OPTIONS.includes(initialLimit)
        ? initialLimit
        : 50,
  );
  const [refreshIntervalMs, setRefreshIntervalMs] = React.useState(
    editing?.refreshIntervalMs ?? settings.defaultRefreshIntervalMs,
  );
  const refreshTouchedRef = React.useRef(false);

  React.useEffect(() => {
    if (!refreshTouchedRef.current && !editing) {
      setRefreshIntervalMs(settings.defaultRefreshIntervalMs);
    }
  }, [settings.defaultRefreshIntervalMs, editing]);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [widgets, setWidgets] = React.useState<WidgetConfig[]>(editing?.widgets ?? []);

  const [draftType, setDraftType] = React.useState<VisualizationType>("metric");
  const [draftTitle, setDraftTitle] = React.useState("");
  const [draftWidth, setDraftWidth] = React.useState<1 | 2 | 3>(defaultWidth("metric"));
  const [metricField, setMetricField] = React.useState("__count__");
  const [metricAggregation, setMetricAggregation] = React.useState<Aggregation>("count");
  const [xField, setXField] = React.useState("");
  const [yField, setYField] = React.useState("__none__");
  const [aggregation, setAggregation] = React.useState<Aggregation>("count");
  const [groupField, setGroupField] = React.useState("");

  const result = state.result;
  const fields = React.useMemo(() => inferFields(result?.entities ?? []), [result]);
  const numericFields = React.useMemo(
    () => fields.filter((field) => field.numeric && field.presentCount > 0),
    [fields],
  );
  const categoricalFields = React.useMemo(
    () => fields.filter((field) => field.categorical && field.presentCount > 0),
    [fields],
  );

  const defaultX =
    numericFields.find((field) => field.name === "$createdAt") ??
    numericFields.find((field) => field.name === "$updatedAt") ??
    numericFields[0];
  const defaultGroup =
    categoricalFields.find((field) => field.name === "arkiv.schema") ?? categoricalFields[0];

  const effectiveMetricField =
    metricField !== "__count__" && numericFields.some((field) => field.name === metricField)
      ? metricField
      : "__count__";
  const effectiveX =
    numericFields.some((field) => field.name === xField) ? xField : (defaultX?.name ?? "");
  const effectiveGroup =
    categoricalFields.some((field) => field.name === groupField) ? groupField : (defaultGroup?.name ?? "");
  const effectiveY =
    yField !== "__none__" && numericFields.some((field) => field.name === yField)
      ? yField
      : "";

  const execute = React.useCallback(() => {
    const trimmed = query.trim();
    const rough = roughQueryError(trimmed);
    if (rough) {
      setValidationError(rough);
      return;
    }
    setValidationError(null);
    void run({ network, query: trimmed, limit, offset: 0, count: true });
  }, [query, network, limit, run]);

  React.useEffect(() => {
    if (editing) {
      void run({
        network: editing.network,
        query: editing.query.text.trim(),
        limit: editing.query.limit,
        offset: 0,
        count: true,
      });
      return;
    }
    if (initialQuery?.trim()) execute();
    // The deep-linked or saved query is executed once; later runs are user initiated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seededRef = React.useRef(Boolean(editing));
  React.useEffect(() => {
    if (seededRef.current || !result || state.status !== "success") return;
    if (result.entities.length === 0) return;
    seededRef.current = true;
    setWidgets((current) =>
      current.length > 0 ? current : recommendWidgets(fields, result.entities.length),
    );
  }, [fields, result, state.status]);

  const draftWidget = React.useMemo<WidgetConfig>(
    () => ({
      id: "preview",
      title: draftTitle.trim(),
      type: draftType,
      width: draftWidth,
      metricField: effectiveMetricField === "__count__" ? undefined : effectiveMetricField,
      metricAggregation: metricAggregation,
      xField: effectiveX || undefined,
      yField: effectiveY || undefined,
      aggregation,
      groupField: effectiveGroup || undefined,
      maxGroups: draftType === "pie" ? 8 : 12,
    }),
    [
      draftType,
      draftWidth,
      draftTitle,
      effectiveMetricField,
      metricAggregation,
      effectiveX,
      effectiveY,
      aggregation,
      effectiveGroup,
    ],
  );

  const draftError = React.useMemo(() => {
    if (!result) return "Execute a query before composing a visualization.";
    if (draftType === "metric") {
      if (effectiveMetricField === "__count__") return null;
      const field = getField(fields, effectiveMetricField);
      if (!field || !field.numeric) return "Choose a numeric field, or use the node match count.";
      return null;
    }
    if (draftType === "table") return result.entities.length === 0 ? "No entities to display." : null;
    if (draftType === "line" || draftType === "area") {
      if (!effectiveX) return "Choose a numeric field for the X axis.";
      if (aggregation !== "count" && !effectiveY) return "Choose a numeric measure, or aggregate with Count.";
      return null;
    }
    if (!effectiveGroup) return "Choose a categorical field to group by.";
    if (aggregation !== "count" && !effectiveY) return "Choose a numeric measure, or aggregate with Count.";
    return null;
  }, [result, draftType, effectiveMetricField, effectiveX, effectiveY, effectiveGroup, aggregation, fields]);

  const widgetIssues = React.useMemo(
    () =>
      result
        ? widgets
            .map((widget) => ({ id: widget.id, issue: widgetIssue(widget, fields, result.entities.length) }))
            .filter((entry): entry is { id: string; issue: string } => entry.issue !== null)
        : [],
    [widgets, fields, result],
  );

  const queryMatchesResult = result !== null && result.executedQuery === query.trim();
  const canSave =
    name.trim().length > 0 &&
    widgets.length > 0 &&
    queryMatchesResult &&
    widgetIssues.length === 0;

  const chooseType = (type: VisualizationType) => {
    setDraftType(type);
    setDraftWidth(defaultWidth(type));
    if (type === "metric") setMetricField("__count__");
    if ((type === "bar" || type === "pie") && !effectiveGroup) setGroupField(defaultGroup?.name ?? "");
    if ((type === "line" || type === "area") && !effectiveX) setXField(defaultX?.name ?? "");
  };

  const addWidget = () => {
    if (draftError) return;
    setWidgets((current) => [
      ...current,
      { ...draftWidget, id: createId("widget"), title: draftTitle.trim() },
    ]);
    setDraftTitle("");
    toast.success("Widget added to the layout");
  };

  const autoGenerate = () => {
    if (!result || result.entities.length === 0) return;
    const recommended = recommendWidgets(fields, result.entities.length);
    if (recommended.length === 0) return;
    setWidgets(recommended);
    toast.success("Layout generated from the live result", {
      description: "Every widget references fields present in this page of entities.",
    });
  };

  const save = () => {
    setSaveError(null);
    if (!name.trim()) {
      setNameError("Give the dashboard a name.");
      return;
    }
    if (!result || !queryMatchesResult) {
      setSaveError("Execute the exact query you want to save before creating the dashboard.");
      return;
    }
    if (widgets.length === 0) {
      setSaveError("Add at least one visualization.");
      return;
    }
    if (widgetIssues.length > 0) {
      setSaveError("Some widgets reference fields that are no longer present in the result.");
      return;
    }

    const now = new Date().toISOString();
    try {
      const dashboard = {
        version: 1 as const,
        id: editing?.id ?? createId("dash"),
        name: name.trim(),
        network,
        query: { text: query.trim(), limit },
        widgets,
        layout: { columns: 3 as const },
        refreshIntervalMs,
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
      };
      saveDashboard(dashboard);
      toast.success(isEditing ? "Dashboard updated" : "Dashboard saved", {
        description: "Stored locally in this browser.",
      });
      router.push(`/dashboards/${dashboard.id}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save the dashboard.");
    }
  };

  const publicRpcWarning =
    networkStatus.status !== null && !networkStatus.accessKeyConfigured && networkStatus.connected;

  const workflowDone = [
    name.trim().length > 0,
    queryMatchesResult,
    Boolean(result) && state.status === "success",
    widgets.length > 0,
    widgets.length > 0,
    false,
  ];

  return (
    <div className="space-y-5">
      <WorkflowStepper completed={workflowDone} />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0 space-y-4">
        {publicRpcWarning && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-2.5 text-[12px] leading-relaxed text-amber-800 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <p>
              Queries run on the shared public RPC and are rate-limited. Add an{" "}
              <code className="font-mono">ARKIV_ACCESS_KEY</code> to use a dedicated quota.
            </p>
          </div>
        )}

        <section className="panel space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="eyebrow">01 · Name &amp; query</p>
              <h2 className="mt-1 section-title">Configure the data source</h2>
            </div>
            <Badge variant="outline" className="font-mono text-[9.5px]">
              {network}
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="dashboard-name" className="mb-1.5 block text-[11px]">
                Dashboard name
              </Label>
              <Input
                id="dashboard-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameError(null);
                }}
                placeholder="Polygon activity pulse"
                aria-invalid={Boolean(nameError)}
                className="h-8 text-[12.5px]"
              />
              {nameError && <p className="mt-1 text-[10.5px] text-destructive">{nameError}</p>}
            </div>
            <div>
              <Label className="mb-1.5 block text-[11px]">Network</Label>
              <Select value={network} onValueChange={(value) => setNetwork(value as NetworkId)}>
                <SelectTrigger size="sm" className="w-full" aria-label="Network">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rabdi">Rabdi Testnet · 7794095</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <Label className="text-[11px]">Arkiv query</Label>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>limit</span>
                <Select value={String(limit)} onValueChange={(value) => setLimit(Number(value))}>
                  <SelectTrigger size="sm" className="h-6 w-[5.5rem] text-[10.5px]" aria-label="Query limit">
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
              </div>
            </div>
            <QueryEditor
              value={query}
              onChange={(next) => {
                setQuery(next);
                setValidationError(null);
              }}
              onSubmit={execute}
            />
            {validationError && (
              <p className="mt-2 text-[11px] text-destructive" role="alert">
                {validationError}
              </p>
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {isLoading ? (
                <Button variant="outline" size="sm" onClick={cancel} className="gap-1.5">
                  <CircleStop className="size-3.5" />
                  Cancel
                </Button>
              ) : (
                <Button size="sm" onClick={execute} className="gap-1.5">
                  <Play className="size-3.5" />
                  Execute query
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  cancel();
                  reset();
                  setWidgets([]);
                  seededRef.current = false;
                }}
              >
                Reset
              </Button>
              <span className="text-[10.5px] text-muted-foreground">
                {result
                  ? `Last run at block #${formatInteger(result.blockNumber)} in ${result.durationMs} ms`
                  : "No query executed in this session yet."}
              </span>
            </div>
          </div>
        </section>

        <section className="panel space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="eyebrow">02 · Inspect</p>
              <h2 className="mt-1 section-title">Live result preview</h2>
            </div>
            {result && (
              <Badge
                variant="outline"
                className="gap-1.5 border-emerald-500/25 bg-emerald-500/10 font-normal text-emerald-700 dark:text-emerald-300"
              >
                <span className="size-1.5 rounded-full bg-emerald-400" />
                {result.network.label}
              </Badge>
            )}
          </div>

          {isLoading && !result ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : state.error && !result ? (
            <QueryErrorPanel error={state.error} onRetry={execute} title="Query failed" />
          ) : result ? (
            <DatasetPreview result={result} />
          ) : (
            <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border/70 py-8 text-center">
              <Info className="size-4 text-muted-foreground" />
              <p className="text-[12px] text-muted-foreground">
                Execute a query to inspect the real fields available for visualization.
              </p>
              <p className="text-[10.5px] text-muted-foreground/70">
                Visualizations are only offered for fields the node actually returns.
              </p>
            </div>
          )}

          {state.error && result && (
            <QueryErrorPanel
              compact
              title="Latest refresh failed — preview shows the last successful data"
              error={state.error}
              onRetry={execute}
            />
          )}
        </section>

        <section className="panel space-y-3.5">
          <div>
            <p className="eyebrow">03 · Visualize</p>
            <h2 className="mt-1 section-title">Compose a widget</h2>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {TYPE_ORDER.map((type) => {
              const Icon = TYPE_ICONS[type];
              const reason = result
                ? incompatibleReason(type, fields, result.entities.length)
                : "Execute a query first.";
              const disabled = reason !== null;
              const selected = draftType === type;
              return (
                <button
                  key={type}
                  type="button"
                  disabled={disabled}
                  title={reason ?? VISUALIZATION_META[type].description}
                  onClick={() => chooseType(type)}
                  className={`flex flex-col items-start gap-1.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    selected
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border/70 bg-background/25 text-muted-foreground hover:border-border hover:text-foreground"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <span className="flex w-full items-center justify-between">
                    <Icon className="size-4" />
                    {selected && <Check className="size-3 text-primary" />}
                  </span>
                  <span className="text-[11px] font-medium">
                    {VISUALIZATION_META[type].label}
                  </span>
                </button>
              );
            })}
          </div>

          {result && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {draftType === "metric" ? (
                  <>
                    <div>
                      <Label className="mb-1 block text-[10.5px]">Value</Label>
                      <Select value={effectiveMetricField} onValueChange={setMetricField}>
                        <SelectTrigger size="sm" className="w-full text-[11.5px]" aria-label="Metric field">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__count__">Matching entity count</SelectItem>
                          {numericFields.map((field) => (
                            <SelectItem key={field.name} value={field.name}>
                              {field.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {effectiveMetricField !== "__count__" && (
                      <div>
                        <Label className="mb-1 block text-[10.5px]">Aggregation</Label>
                        <Select
                          value={metricAggregation}
                          onValueChange={(value) => setMetricAggregation(value as Aggregation)}
                        >
                          <SelectTrigger size="sm" className="w-full text-[11.5px]" aria-label="Metric aggregation">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(AGGREGATION_LABELS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </>
                ) : draftType === "table" ? (
                  <div className="sm:col-span-2 lg:col-span-4">
                    <p className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-[11px] text-muted-foreground">
                      The table shows every returned entity with all attributes and system fields.
                    </p>
                  </div>
                ) : (
                  <>
                    {draftType === "line" || draftType === "area" ? (
                      <div>
                        <Label className="mb-1 block text-[10.5px]">X axis · numeric</Label>
                        <Select value={effectiveX} onValueChange={setXField}>
                          <SelectTrigger size="sm" className="w-full text-[11.5px]" aria-label="X axis field">
                            <SelectValue placeholder="Choose field" />
                          </SelectTrigger>
                          <SelectContent>
                            {numericFields.map((field) => (
                              <SelectItem key={field.name} value={field.name}>
                                {field.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div>
                        <Label className="mb-1 block text-[10.5px]">Group by · categorical</Label>
                        <Select value={effectiveGroup} onValueChange={setGroupField}>
                          <SelectTrigger size="sm" className="w-full text-[11.5px]" aria-label="Group field">
                            <SelectValue placeholder="Choose field" />
                          </SelectTrigger>
                          <SelectContent>
                            {categoricalFields.map((field) => (
                              <SelectItem key={field.name} value={field.name}>
                                {field.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div>
                      <Label className="mb-1 block text-[10.5px]">Aggregation</Label>
                      <Select
                        value={aggregation}
                        onValueChange={(value) => setAggregation(value as Aggregation)}
                      >
                        <SelectTrigger size="sm" className="w-full text-[11.5px]" aria-label="Aggregation">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(AGGREGATION_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="mb-1 block text-[10.5px]">
                        Measure {aggregation === "count" ? "· optional" : "· required"}
                      </Label>
                      <Select value={yField} onValueChange={setYField}>
                        <SelectTrigger size="sm" className="w-full text-[11.5px]" aria-label="Measure field">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None — count entities</SelectItem>
                          {numericFields.map((field) => (
                            <SelectItem key={field.name} value={field.name}>
                              {field.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                <div>
                  <Label className="mb-1 block text-[10.5px]">Width</Label>
                  <Select
                    value={String(draftWidth)}
                    onValueChange={(value) => setDraftWidth(Number(value) as 1 | 2 | 3)}
                  >
                    <SelectTrigger size="sm" className="w-full text-[11.5px]" aria-label="Widget width">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 / 3 · narrow</SelectItem>
                      <SelectItem value="2">2 / 3 · standard</SelectItem>
                      <SelectItem value="3">3 / 3 · full width</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="widget-title" className="mb-1 block text-[10.5px]">
                    Title · optional
                  </Label>
                  <Input
                    id="widget-title"
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    placeholder="Auto from fields"
                    className="h-7 text-[11.5px]"
                  />
                </div>
              </div>

              {draftError ? (
                <p className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                  <TriangleAlert className="size-3" />
                  {draftError}
                </p>
              ) : (
                <p className="text-[10.5px] text-muted-foreground">
                  {effectiveMetricField !== "__count__" && draftType === "metric"
                    ? `Uses ${formatInteger(result.entities.length)} loaded rows; the node total is not used for field aggregates.`
                    : "Preview uses the exact data returned by this query."}
                </p>
              )}

              <div className="grid gap-2 md:grid-cols-3">
                <div className={`min-w-0 ${WIDGET_WIDTH_CLASS[draftWidget.width]}`}>
                  <DashboardWidget
                    widget={draftWidget}
                    entities={result.entities}
                    fields={fields}
                    totalCount={result.count}
                    blockNumber={result.blockNumber}
                    queryLimit={result.request.limit}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                <p className="text-[10.5px] text-muted-foreground">
                  The preview renders from the same data the saved dashboard will poll.
                </p>
                <Button size="sm" onClick={addWidget} disabled={Boolean(draftError)} className="gap-1.5">
                  <Plus className="size-3.5" />
                  Add widget
                </Button>
              </div>
            </>
          )}
        </section>
      </div>

      <aside className="min-w-0 space-y-3 xl:sticky xl:top-6">
        <section className="panel space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[12.5px] font-medium text-foreground">Layout</h2>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="xs"
                className="gap-1 text-muted-foreground"
                onClick={autoGenerate}
                disabled={!result || result.entities.length === 0}
                title="Replace the layout with widgets derived from the current result"
              >
                <Sparkles className="size-3" />
                Auto
              </Button>
              <Badge variant="outline" className="font-mono text-[9.5px]">
                3 columns
              </Badge>
            </div>
          </div>

          <div>
            <Label className="mb-1 block text-[10.5px]">Refresh interval</Label>
            <Select
              value={String(refreshIntervalMs)}
              onValueChange={(value) => {
                refreshTouchedRef.current = true;
                setRefreshIntervalMs(Number(value));
              }}
            >
              <SelectTrigger size="sm" className="w-full text-[11.5px]" aria-label="Refresh interval">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REFRESH_INTERVALS.map((interval) => (
                  <SelectItem key={interval.value} value={String(interval.value)}>
                    {interval.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Applied through request polling after saving. {formatRefreshInterval(refreshIntervalMs)}.
            </p>
          </div>

          {widgets.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-[11px] text-muted-foreground">
              Widgets you add appear here. A starter layout is generated automatically from the
              fields in the first successful result.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {widgets.map((widget) => {
                const Icon = TYPE_ICONS[widget.type];
                const issue = widgetIssues.find((entry) => entry.id === widget.id);
                return (
                  <li
                    key={widget.id}
                    className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/25 px-2 py-1.5"
                  >
                    <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] text-foreground">
                        {widget.title || VISUALIZATION_META[widget.type].label}
                      </p>
                      <p className="text-[9.5px] text-muted-foreground">
                        {VISUALIZATION_META[widget.type].label} · {widget.width}/3
                      </p>
                      {issue && (
                        <p className="mt-0.5 text-[9.5px] text-amber-700 dark:text-amber-300">
                          {issue.issue}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Remove widget"
                      onClick={() =>
                        setWidgets((current) => current.filter((item) => item.id !== widget.id))
                      }
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          {saveError && (
            <p className="text-[11px] text-destructive" role="alert">
              {saveError}
            </p>
          )}

          {!queryMatchesResult && result && (
            <p className="text-[10.5px] text-amber-700 dark:text-amber-300">
              Re-execute the edited query before saving.
            </p>
          )}

          {!canSave && !saveError && queryMatchesResult && (
            <p className="text-[10.5px] text-muted-foreground">
              {!name.trim()
                ? "Add a dashboard name to enable saving."
                : widgets.length === 0
                  ? "Add at least one widget to the layout."
                  : "Resolve the widget issues listed above to enable saving."}
            </p>
          )}

          <Button className="w-full gap-1.5" onClick={save} disabled={!canSave}>
            <Save className="size-3.5" />
            {isEditing ? "Update dashboard" : "Save dashboard"}
          </Button>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            {isEditing
              ? "Updates the saved configuration in this browser. Arkiv rows are re-read live."
              : "Saved to this browser's local storage. No account, backend or credentials are involved."}
          </p>
          <Button variant="ghost" size="sm" asChild className="w-full justify-start gap-1.5">
            <Link href="/dashboards">
              <ArrowLeft className="size-3.5" />
              Back to dashboards
            </Link>
          </Button>
        </section>
      </aside>
      </div>
    </div>
  );
}
