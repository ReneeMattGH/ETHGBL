import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedDocument } from "./model";
import { validateDashboard } from "./core";
import { dashboardFingerprint, dashboardStarter } from "./dashboard-document";

const { readPublic } = vi.hoisted(() => ({ readPublic: vi.fn() }));
vi.mock("./public-report", () => ({ publicReport: readPublic }));
import { deployDashboardWebsite, viewerConfiguration } from "./dashboard-deployment";

const key = `0x${"7".repeat(64)}`, query = { datasetKey: `0x${"1".repeat(64)}`, filters: {} };
const doc = validateDashboard({ version: 1, title: "Treasury", description: "Verified data", query, widgets: dashboardStarter(query), refreshMs: 30000 });
const dashboard = { key, owner: "0x" + "a".repeat(40), document: doc, title: doc.title, expiresAt: "999999" } as SavedDocument;
const fetchMock = vi.fn();
beforeEach(() => { vi.stubEnv("AXIS_DASHBOARD_VIEWER_URL", "https://reports.example.com"); vi.stubGlobal("fetch", fetchMock); readPublic.mockResolvedValue(dashboard); });
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Dashboard website deployment", () => {
  it("returns a dedicated website link only after its anonymous definition matches Arkiv", async () => {
    fetchMock.mockResolvedValue(Response.json({ service: "axis-dashboard-viewer", dashboard }));
    expect(await deployDashboardWebsite(key, dashboardFingerprint(doc))).toEqual({ entityKey: key, url: `https://reports.example.com/d/${key}`, title: "Treasury", expiresAt: "999999" });
    expect(fetchMock).toHaveBeenCalledWith(`https://reports.example.com/api/reports/${key}/definition`, expect.objectContaining({ redirect: "error", cache: "no-store" }));
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("headers");
  });
  it("does not claim a protected, unreachable or mismatched viewer is deployed", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Sign in", { status: 401 }));
    await expect(deployDashboardWebsite(key, dashboardFingerprint(doc))).rejects.toThrow("anonymously");
    fetchMock.mockRejectedValueOnce(new Error("redirect to sign in"));
    await expect(deployDashboardWebsite(key, dashboardFingerprint(doc))).rejects.toThrow("could not be reached");
    fetchMock.mockResolvedValueOnce(Response.json({ service: "axis-dashboard-viewer", dashboard: { ...dashboard, document: { ...doc, title: "Old title" } } }));
    await expect(deployDashboardWebsite(key, dashboardFingerprint(doc))).rejects.toThrow("saved dashboard definition");
  });
  it("rejects an unsaved version and an expired dashboard without probing or publishing anything", async () => {
    await expect(deployDashboardWebsite(key, dashboardFingerprint({ ...doc, title: "Unsaved" }))).rejects.toThrow("differs from this editor");
    readPublic.mockRejectedValueOnce(new Error("Entity is missing, deleted, or expired on Arkiv."));
    await expect(deployDashboardWebsite(key, dashboardFingerprint(doc))).rejects.toThrow("expired");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("requires a public HTTPS origin and never produces a localhost share link", () => {
    expect(viewerConfiguration("")).toEqual({ configured: false, viewerUrl: null });
    for (const url of ["http://reports.example.com", "https://localhost", "https://127.0.0.1", "https://192.168.1.1", "https://user:secret@reports.example.com", "https://reports.example.com/d/test", "https://reports.example.com/?token=secret"]) expect(() => viewerConfiguration(url)).toThrow();
    expect(viewerConfiguration("https://reports.example.com/").viewerUrl).toBe("https://reports.example.com");
  });
});
