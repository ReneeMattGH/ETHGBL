import { isDeepStrictEqual } from "node:util";
import { publicReport } from "./public-report";
import { assertKey } from "./store";
import { dashboardFingerprint } from "./dashboard-document";
import { readState } from "./queue";

export type DashboardDeployment = { entityKey: string; url: string; title: string; expiresAt: string };
export type ViewerConfiguration = { configured: boolean; viewerUrl: string | null };

export function viewerConfiguration(value = process.env.AXIS_DASHBOARD_VIEWER_URL): ViewerConfiguration {
  if (!value?.trim()) return { configured: false, viewerUrl: null };
  const url = new URL(value.trim()), host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "[::1]" || /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)) throw new Error("Connect a public HTTPS dashboard viewer URL without a path, credentials, query or fragment.");
  return { configured: true, viewerUrl: url.origin };
}
export async function connectedViewer(): Promise<ViewerConfiguration> {
  if (process.env.AXIS_DASHBOARD_VIEWER_URL?.trim()) return viewerConfiguration();
  const saved = await readState<{ url: string } | null>("dashboard-viewer-host", null);
  return viewerConfiguration(saved?.url ?? "");
}
export async function deployDashboardWebsite(entityKey: string, documentHash: string): Promise<DashboardDeployment> {
  assertKey(entityKey);
  if (!/^0x[0-9a-f]{64}$/.test(documentHash)) throw new Error("Invalid dashboard version.");
  const config = await connectedViewer();
  if (!config.viewerUrl) throw new Error("Public dashboard hosting is not connected yet. Connect the dashboard viewer before deploying a website.");
  const dashboard = await publicReport(entityKey);
  if (dashboardFingerprint(dashboard.document) !== documentHash) throw new Error("The saved dashboard differs from this editor. Save the current version before deploying.");
  // A successful anonymous read proves this website serves the saved definition.
  // Never turn a local AXIS address or a protected Vercel login page into a share link.
  let response: Response;
  try { response = await fetch(`${config.viewerUrl}/api/reports/${entityKey}/definition`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) }); }
  catch { throw new Error("The public dashboard website could not be reached. Your dashboard is saved on Arkiv; retry after its viewer is online."); }
  if (!response.ok) throw new Error(`The public dashboard website is not available anonymously (HTTP ${response.status}). Your dashboard is saved on Arkiv.`);
  const value = await response.json() as { service?: string; dashboard?: SavedDefinition };
  if (value.service !== "axis-dashboard-viewer" || value.dashboard?.key?.toLowerCase() !== entityKey.toLowerCase() || !isDeepStrictEqual(value.dashboard.document, dashboard.document)) throw new Error("The public website did not return the saved dashboard definition. Check the viewer's Arkiv configuration and retry.");
  return { entityKey, url: `${config.viewerUrl}/d/${entityKey}`, title: dashboard.title, expiresAt: dashboard.expiresAt };
}
type SavedDefinition = { key: string; document: unknown };
