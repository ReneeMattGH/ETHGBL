import { expect, test, type Page } from "@playwright/test";
import { READ_CACHE_STORAGE_KEY, READ_MAX_AGE_MS } from "../src/lib/axis/read-cache";
import { POLYGON_ACTIVITY_DATASET_KEY } from "../src/lib/axis/catalog-sources";
import { aggregateTransfers } from "../src/lib/axis/core";
import { dashboardStarter } from "../src/lib/axis/dashboard-document";
import { USDC, type Transfer } from "../src/lib/axis/model";

async function setup(page: Page) {
  const requests = new Map<string, number>();
  let count = 125, failure = false;
  let release: (() => void) | undefined;
  let gate: Promise<void> | undefined;
  await page.route("**/api/axis/**", async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace("/api/axis/", "");
    let json: unknown = {};
    if (path === "catalog/source") json = { dataset: { key: POLYGON_ACTIVITY_DATASET_KEY, name: "Polygon activity" } };
    if (path === "bulk/imports") json = { imports: [] };
    if (path === "catalog/insights") {
      const item = url.searchParams.get("item")!;
      requests.set(item, (requests.get(item) ?? 0) + 1);
      await gate;
      if (failure) return route.fulfill({ status: 503, json: { error: "Arkiv temporarily unavailable" } });
      json = { entryId: item, status: "available", metrics: [{ label: "Verified transfers", value: String(count) }], charts: [{ title: item === "stablecoins" ? "USDC transfer volume" : "Token transfer activity", kind: "stacked-area", unit: "Transfers", decimals: 0, points: [{ label: "Block 100", value: String(count) }, { label: "Block 101", value: String(count + 5) }] }] };
    }
    await route.fulfill({ json });
  });
  return { requests, count: (value: number) => { count = value; }, fail: () => { failure = true; }, hold: () => { gate = new Promise<void>(resolve => { release = resolve; }); }, release: () => { release?.(); gate = undefined; } };
}

const metric = (page: Page) => page.locator(".axis-catalog-activity .axis-stat strong");
async function ageStoredReads(page: Page, age: number) {
  await page.evaluate(({ key, age }) => {
    const entries = JSON.parse(sessionStorage.getItem(key)!);
    for (const [, entry] of entries) entry.updatedAt = Date.now() - age;
    sessionStorage.setItem(key, JSON.stringify(entries));
  }, { key: READ_CACHE_STORAGE_KEY, age });
}

test("collection navigation and reload render cached charts without another Arkiv read", async ({ page }) => {
  const network = await setup(page), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/explore?view=curated&item=token-transfers");
  await expect(metric(page)).toHaveText("125");
  await page.getByRole("button", { name: "Stablecoin Activity", exact: true }).click();
  await expect(page.getByRole("heading", { name: "USDC transfer volume", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Token Transfers", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Token transfer activity", exact: true })).toBeVisible();
  expect(network.requests.get("token-transfers")).toBe(1);
  await page.reload();
  await expect(metric(page)).toHaveText("125");
  await expect(page.getByRole("heading", { name: "Token transfer activity", exact: true })).toBeVisible();
  expect(network.requests.get("token-transfers")).toBe(1);
  expect(errors).toEqual([]);
});

test("stale data stays visible during background refresh; explicit refresh bypasses fresh cache", async ({ page }) => {
  const network = await setup(page);
  await page.goto("/explore?item=token-transfers");
  await expect(metric(page)).toHaveText("125");
  await ageStoredReads(page, 31_000);
  network.hold(); network.count(250);
  try {
    await page.reload();
    await expect.poll(() => network.requests.get("token-transfers")).toBe(2);
    await expect(metric(page)).toHaveText("125");
    await expect(page.getByRole("heading", { name: "Token transfer activity", exact: true })).toBeVisible();
  } finally { network.release(); }
  await expect(metric(page)).toHaveText("250");
  network.hold(); network.count(500);
  try {
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect.poll(() => network.requests.get("token-transfers")).toBe(3);
    await expect(metric(page)).toHaveText("250");
  } finally { network.release(); }
  await expect(metric(page)).toHaveText("500");
});

test("failed background refresh keeps last successful visuals and reports the failure", async ({ page }) => {
  const network = await setup(page);
  await page.goto("/explore?item=token-transfers");
  await expect(metric(page)).toHaveText("125");
  await ageStoredReads(page, 31_000); network.fail();
  await page.reload();
  await expect(page.locator(".axis-catalog-activity").getByRole("alert")).toContainText("Refresh failed. Showing the last successful data.");
  await expect(metric(page)).toHaveText("125");
});

test("expired browser copies are discarded instead of presented as current analytics", async ({ page }) => {
  const network = await setup(page);
  await page.goto("/explore?item=token-transfers");
  await expect(metric(page)).toHaveText("125");
  await ageStoredReads(page, READ_MAX_AGE_MS + 1); network.hold(); network.count(999);
  try {
    await page.reload();
    await expect.poll(() => network.requests.get("token-transfers")).toBe(2);
    await expect(metric(page)).toHaveCount(0);
    await expect(page.getByText("Reading from Arkiv…", { exact: true })).toBeVisible();
  } finally { network.release(); }
  await expect(metric(page)).toHaveText("999");
});

test("dashboard analytics and table POST reads restore together and Refresh report fetches both again", async ({ page }) => {
  const datasetKey = "0x" + "1".repeat(64), dashboardKey = "0x" + "7".repeat(64), owner = "0x" + "a".repeat(40);
  const dataset = { key: datasetKey, name: "Treasury", owner, creator: owner, writer: owner, chainId: 137, contract: USDC, enabled: true, startBlock: "10", endBlock: "0" };
  const query = { datasetKey, filters: { order: "desc" as const } };
  const widgets = dashboardStarter(query).slice(0, 1).concat(dashboardStarter(query).slice(4, 5));
  widgets.push({ ...widgets[0], id: "records", kind: "table", title: "Records" });
  const rows: Transfer[] = [0, 1].map(index => ({ datasetKey, entityKey: "row" + index, sourceId: String(index), chainId: 137, contract: USDC, blockNumber: String(10 + index), blockHash: datasetKey, timestamp: String(1794000000 + index * 60), txHash: datasetKey, txIndex: 0, logIndex: index, sender: owner, recipient: owner, amountRaw: "1000000", amount: "1", decimals: 6, contentHash: datasetKey }));
  const coverage = { complete: true, fromBlock: "10", throughBlock: "11", actualRows: 2, gaps: [], manifests: [] };
  const modes: string[] = [];
  await page.route("**/api/axis/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/api/axis/", "");
    let json: unknown = {};
    if (path === "datasets") json = { datasets: [dataset] };
    if (path.startsWith("schema/")) json = { datasetKey, observed: true, fields: [{ name: "sender", type: "addr", indexed: true }] };
    if (path === "dashboards/" + dashboardKey) json = { dashboard: { key: dashboardKey, owner, title: "Treasury report", document: { version: 1, title: "Treasury report", description: "", query, refreshMs: 0, widgets } } };
    if (path === "query") {
      modes.push(route.request().postDataJSON().mode);
      json = { dataset, entities: rows, analytics: aggregateTransfers(rows), total: "2", coverage, scope: { fromBlock: "10", toBlock: "11" }, executedQuery: "Scoped Arkiv test query", blockNumber: "123", fetchedAt: new Date().toISOString() };
    }
    await route.fulfill({ json });
  });
  await page.goto("/dashboards/" + dashboardKey);
  const volume = page.getByRole("region", { name: "Transferred USDC", exact: true }).locator(".axis-report-metric strong");
  await expect(volume).toHaveText("2");
  await expect(page.getByRole("table", { name: "Verified transfers" })).toBeVisible();
  expect(modes.toSorted()).toEqual(["analytics", "page"]);
  await page.reload();
  await expect(volume).toHaveText("2");
  await expect(page.getByRole("table", { name: "Verified transfers" })).toBeVisible();
  expect(modes).toHaveLength(2);
  await page.getByRole("button", { name: "Refresh report", exact: true }).click();
  await expect.poll(() => modes.length).toBe(4);
  await expect(volume).toHaveText("2");
});
