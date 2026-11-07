import { describe, expect, it } from "vitest";
import { dashboardStarter, moveVisual, normalizeDashboard } from "./dashboard-document";
import { validateDashboard } from "./core";
import type { DashboardDocument } from "./model";

const keyA = `0x${"1".repeat(64)}`, keyB = `0x${"2".repeat(64)}`;
const query = { datasetKey: keyA, filters: {}, queries: [{ datasetKey: keyA, filters: {} }, { datasetKey: keyB, filters: {} }] };
const document = (): DashboardDocument => ({ version: 1, title: "Treasury activity", description: "Verified transfer analysis", refreshMs: 30000, query, widgets: dashboardStarter(query) });
describe("Interactive dashboard documents", () => {
  it("preserves shared combined filters, visual explanations and valid analytical settings through serialization", () => {
    const restored = normalizeDashboard(validateDashboard(JSON.parse(JSON.stringify(document()))));
    expect(restored.query?.queries?.map(source => source.datasetKey)).toEqual([keyA, keyB]);
    expect(restored.widgets.every(widget => widget.description && widget.query.queries?.length === 2)).toBe(true);
    expect(() => validateDashboard(restored)).not.toThrow();
    expect(restored.widgets.find(widget => widget.kind === "metric" && widget.metric === "uniqueWallets")).toBeDefined();
  });
  it("rejects invalid shared source definitions and oversized explanations before publishing", () => {
    const doc = document();
    expect(() => validateDashboard({ ...doc, query: { ...query, queries: [{ datasetKey: "bad", filters: {} }] } })).toThrow("Invalid query dataset");
    expect(() => validateDashboard({ ...doc, widgets: [{ ...doc.widgets[0], description: "x".repeat(241) }] })).toThrow("Visual explanations");
  });
  it("reorders without mutating the saved layout or dropping visual definitions", () => {
    const widgets = document().widgets, moved = moveVisual(widgets, 4, 0);
    expect(moved[0]).toBe(widgets[4]);
    expect(widgets[0].id).toBe("volume");
    expect(new Set(moved.map(widget => widget.id))).toEqual(new Set(widgets.map(widget => widget.id)));
  });
});
