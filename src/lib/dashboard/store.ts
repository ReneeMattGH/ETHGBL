"use client";

import * as React from "react";
import type { DashboardConfig, VisualizationType, WidgetConfig } from "./types";

export const DASHBOARDS_KEY = "arkiv-viz:dashboards:v1";
export const DASHBOARDS_EVENT = "arkiv-viz:dashboards-changed";

const VISUALIZATIONS = new Set<VisualizationType>(["metric", "line", "bar", "area", "pie", "table"]);

function isWidget(value: unknown): value is WidgetConfig {
  if (!value || typeof value !== "object") return false;
  const widget = value as Partial<WidgetConfig>;
  return (
    typeof widget.id === "string" &&
    typeof widget.title === "string" &&
    typeof widget.type === "string" &&
    VISUALIZATIONS.has(widget.type as VisualizationType) &&
    (widget.width === 1 || widget.width === 2 || widget.width === 3)
  );
}

function parseDashboard(value: unknown): DashboardConfig | null {
  if (!value || typeof value !== "object") return null;
  const dashboard = value as Partial<DashboardConfig>;

  if (
    typeof dashboard.id !== "string" ||
    typeof dashboard.name !== "string" ||
    dashboard.network !== "rabdi" ||
    !dashboard.query ||
    typeof dashboard.query.text !== "string" ||
    typeof dashboard.query.limit !== "number" ||
    !Array.isArray(dashboard.widgets) ||
    dashboard.widgets.length === 0 ||
    !dashboard.widgets.every(isWidget) ||
    typeof dashboard.refreshIntervalMs !== "number" ||
    typeof dashboard.createdAt !== "string" ||
    typeof dashboard.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    version: 1,
    id: dashboard.id,
    name: dashboard.name,
    network: dashboard.network,
    query: {
      text: dashboard.query.text,
      limit: Math.min(100, Math.max(1, Math.round(dashboard.query.limit))),
    },
    widgets: dashboard.widgets,
    layout: { columns: 3 },
    refreshIntervalMs: Math.max(0, Math.round(dashboard.refreshIntervalMs)),
    createdAt: dashboard.createdAt,
    updatedAt: dashboard.updatedAt,
  };
}

export function loadDashboards(): DashboardConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DASHBOARDS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseDashboard)
      .filter((dashboard): dashboard is DashboardConfig => dashboard !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

function persist(dashboards: DashboardConfig[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DASHBOARDS_KEY, JSON.stringify(dashboards));
    window.dispatchEvent(new Event(DASHBOARDS_EVENT));
  } catch {
    throw new Error("Could not write to local storage. Check browser storage permissions.");
  }
}

export function saveDashboard(dashboard: DashboardConfig): void {
  const all = loadDashboards();
  const index = all.findIndex((item) => item.id === dashboard.id);
  if (index >= 0) {
    all[index] = dashboard;
  } else {
    all.unshift(dashboard);
  }
  persist(all);
}

export function deleteDashboard(id: string): void {
  persist(loadDashboards().filter((dashboard) => dashboard.id !== id));
}

export function useDashboards() {
  const [dashboards, setDashboards] = React.useState<DashboardConfig[]>([]);
  const [hydrated, setHydrated] = React.useState(false);

  const refresh = React.useCallback(() => {
    setDashboards(loadDashboards());
  }, []);

  React.useEffect(() => {
    refresh();
    setHydrated(true);

    const onChange = () => refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === DASHBOARDS_KEY) refresh();
    };

    window.addEventListener(DASHBOARDS_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(DASHBOARDS_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  return { dashboards, hydrated, refresh };
}

export function useDashboard(id: string) {
  const { dashboards, hydrated } = useDashboards();
  const dashboard = React.useMemo(
    () => dashboards.find((item) => item.id === id) ?? null,
    [dashboards, id],
  );
  return { dashboard, hydrated, dashboards };
}
