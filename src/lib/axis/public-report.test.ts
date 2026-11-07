import { describe, expect, it, vi } from "vitest";
import { validateDashboard } from "./core";
import { dashboardStarter } from "./dashboard-document";

const { getEntity, dashboardOf, unpack } = vi.hoisted(() => ({ getEntity: vi.fn(), dashboardOf: vi.fn(), unpack: vi.fn() }));
vi.mock("./store", async original => ({ ...await original<typeof import("./store")>(), getEntity, dashboardOf, unpack }));
import { publicReport, reportDatasetKeys, reportQuery } from "./public-report";

const key = `0x${"1".repeat(64)}`, other = `0x${"2".repeat(64)}`;
const query = { datasetKey: key, filters: {} };
const document = validateDashboard({ version: 1, title: "Public report", description: "", query, widgets: dashboardStarter(query), refreshMs: 30000 });
describe("Standalone dashboard data boundaries", () => {
  it("allows dynamic filters only for this report's datasets and only read modes", () => {
    expect(reportQuery(document, { datasetKey: key, filters: { sender: "0x" + "a".repeat(40) }, mode: "analytics" }).queries[0].filters.sender).toBe("0x" + "a".repeat(40));
    expect(() => reportQuery(document, { datasetKey: other, filters: {}, mode: "analytics" })).toThrow("not part");
    expect(() => reportQuery(document, { queries: [query, { datasetKey: other, filters: {} }], filters: {}, mode: "analytics" })).toThrow("not part");
    for (const mode of ["export", "publish", "ingestion"]) expect(() => reportQuery(document, { ...query, mode })).toThrow("Only dashboard data reads");
    expect(() => reportQuery(document, { ...query, mode: "page", limit: 101 })).toThrow("pagination");
  });
  it("keeps all explicitly selected datasets, including older dashboards with independent visuals", () => {
    const legacy = { ...document, query: undefined, widgets: [document.widgets[0], { ...document.widgets[1], query: { datasetKey: other, filters: {} } }] };
    expect(reportDatasetKeys(legacy)).toEqual([key, other]);
    expect(reportQuery(legacy, { queries: [query, { datasetKey: other, filters: {} }], filters: {}, mode: "analytics" }).queries).toHaveLength(2);
  });
  it("does not serve an unpublished definition", async () => {
    getEntity.mockResolvedValue({}); unpack.mockReturnValue({ published: false });
    await expect(publicReport(key)).rejects.toThrow("not published");
    expect(dashboardOf).not.toHaveBeenCalled();
  });
});
