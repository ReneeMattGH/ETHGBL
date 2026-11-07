import { expect, test, type Page } from "@playwright/test";
import { aggregateTransfers, validateDashboard } from "../src/lib/axis/core";
import { dashboardStarter, normalizeDashboard } from "../src/lib/axis/dashboard-document";
import { USDC, type Transfer } from "../src/lib/axis/model";

const key = "0x" + "1".repeat(64), dashboardKey = "0x" + "7".repeat(64), owner = "0x" + "a".repeat(40);
const query = { datasetKey: key, filters: {} };
const document = normalizeDashboard(validateDashboard({ version: 1, title: "Treasury website", description: "Verified treasury activity", query, refreshMs: 30000, widgets: dashboardStarter(query) }));
const dashboard = { key: dashboardKey, owner, title: document.title, document, expiresAt: "999999999" };
const dataset = { key, owner, writer: owner, name: "Treasury transfers", description: "", chainId: 137, contract: USDC, startBlock: "10", endBlock: "0", continuous: true, enabled: true };
const rows = [{ sourceId: "one", chainId: 137, contract: USDC, blockNumber: "10", blockHash: key, timestamp: "1794000000", txHash: key, txIndex: 0, logIndex: 0, sender: owner, recipient: owner, amountRaw: "5000000", amount: "5", decimals: 6, contentHash: key }] satisfies Transfer[];
async function setup(page: Page) {
  const state = { configured: true, fail: false, deployed: [] as Record<string, unknown>[] };
  await page.addInitScript(({ owner }) => { window.ethereum = { request: async ({ method }) => { if (method === "eth_accounts" || method === "eth_requestAccounts") return [owner]; throw new Error("A saved report should not send another wallet transaction."); } }; }, { owner });
  await page.route("**/api/axis/**", route => {
    const path = new URL(route.request().url()).pathname.replace("/api/axis/", "");
    let json: unknown = {};
    if (path === "datasets") json = { datasets: [dataset] };
    if (path === "dashboards/" + dashboardKey) json = { dashboard };
    if (path.startsWith("schema/")) json = { datasetKey: key, fields: [], observed: true };
    if (path === "query") json = { dataset, coverage: { complete: true, gaps: [], manifests: [], fromBlock: "10", throughBlock: "10", expectedRows: 1, actualRows: 1 }, scope: { fromBlock: "10", toBlock: "10", fromTime: null, toTime: null }, analytics: aggregateTransfers(rows), fetchedAt: new Date().toISOString(), executedQuery: "Verified fixture", scannedRows: 1, blockNumber: "10" };
    if (path === "dashboard-deploy") {
      if (route.request().method() === "GET") json = { configured: state.configured, viewerUrl: state.configured ? "https://reports.example.com" : null };
      else { state.deployed.push(route.request().postDataJSON()); if (state.fail) return route.fulfill({ status: 503, json: { error: "The public dashboard website could not be reached. Your dashboard is saved on Arkiv." } }); json = { entityKey: dashboardKey, title: dashboard.title, expiresAt: dashboard.expiresAt, url: "https://reports.example.com/d/" + dashboardKey }; }
    }
    return route.fulfill({ json });
  });
  await page.goto(`/dashboards/${dashboardKey}/edit`);
  await expect(page.getByRole("heading", { name: "Edit dashboard", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Deploy", exact: true })).toBeEnabled();
  return state;
}

test("Deploy verifies the separate website and offers a public link without navigating into AXIS", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const state = await setup(page);
  await page.getByRole("button", { name: "Deploy", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Your dashboard website is ready", exact: true });
  await expect(dialog).toBeVisible();
  expect(state.deployed).toHaveLength(1);
  expect(state.deployed[0]).toMatchObject({ entityKey: dashboardKey, documentHash: expect.stringMatching(/^0x[0-9a-f]{64}$/) });
  const url = "https://reports.example.com/d/" + dashboardKey;
  await expect(dialog.getByRole("link", { name: "Open website", exact: true })).toHaveAttribute("href", url);
  await dialog.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  await page.screenshot({ path: ".axis/report-builder/deployed-website.png", fullPage: true });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Deploy", exact: true })).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`/dashboards/${dashboardKey}/edit$`));
});

test("missing hosting and failed public verification never show a fake deployed link and can be retried", async ({ page }) => {
  const state = await setup(page); state.configured = false;
  await page.getByRole("button", { name: "Deploy", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "hosting is not connected" })).toBeVisible();
  expect(state.deployed).toHaveLength(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  state.configured = true; state.fail = true;
  await page.getByRole("button", { name: "Deploy", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "could not be reached" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  state.fail = false;
  await page.getByRole("button", { name: "Deploy", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Your dashboard website is ready" })).toBeVisible();
  expect(state.deployed).toHaveLength(2);
});
