import { expect, test, type Page } from "@playwright/test";
import { CURATED_COLLECTIONS } from "../src/lib/axis/catalog";
import { POLYGON_ACTIVITY_DATASET_KEY } from "../src/lib/axis/catalog-sources";
import { BULK_TABLES } from "../src/lib/axis/bulk/publication-model";

const snapshotKey = "0x" + "f".repeat(64), userKey = "0x" + "1".repeat(64);
const dataset = { key: POLYGON_ACTIVITY_DATASET_KEY, name: "Polygon USDC · Live activity", owner: "0x" + "a".repeat(40), enabled: true, continuous: true };
const published = { key: snapshotKey, name: "Verified Polygon activity", document: { throughBlock: "200", fromBlock: "100", recordCount: 100, counts: Object.fromEntries(Object.keys(BULK_TABLES).map(id => [id, 1])), tableCoverage: Object.fromEntries(Object.keys(BULK_TABLES).map(id => [id, { state: "available" }])) } };
const titles: Record<string, [string, string]> = {
  "token-registry": ["Token contracts", "Registered tokens by symbol"], "chain-rpc": ["Public RPC endpoints", "RPC registry status"],
  "address-labels": ["Labelled addresses", "Address labels by protocol"], signatures: ["Function signatures", "Function signatures by source"],
  "wallet-ratings": ["Rated wallets", "Wallet activity score distribution"], "token-transfers": ["Transfers", "Token transfer activity"],
  stablecoins: ["USDC transferred", "USDC transfer volume"], dex: ["Trades", "DEX trade activity"], lending: ["Lending actions", "Lending activity"], prediction: ["Trade fills", "Prediction-market fills"],
};
const insights = (entry: string) => ({ entryId: entry, status: "available", metrics: [{ label: titles[entry][0], value: "12" }], charts: [{ title: titles[entry][1], kind: "bar", unit: titles[entry][0], decimals: 0, points: [{ label: "Verified group", value: "12" }] }], source: { name: "Polygon live activity", table: entry, fromBlock: "100", throughBlock: "200", fetchedAt: "2026-11-07T00:00:00Z", executedQuery: "Trusted Arkiv query" } });
async function setup(page: Page, previews: string[] = []) {
  // Controlled API fixtures exercise presentation without publishing sample records.
  await page.route("**/api/axis/**", async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace("/api/axis/", "");
    let json: unknown = {};
    if (path === "catalog/source") json = { dataset };
    else if (path === "bulk/imports") json = { imports: [published] };
    else if (path === "catalog/insights") json = insights(url.searchParams.get("item")!);
    else if (path === "catalog/preview") {
      previews.push(url.search);
      const bulk = url.searchParams.has("import");
      json = { tableId: url.searchParams.get("table"), offset: 0, total: "1", rows: [{ key: snapshotKey, values: { blockNumber: "200", txHash: snapshotKey, sender: "0xwallet", recipient: "0xrecipient", amount: "1", symbol: "USDC" } }], fields: [], scope: { datasetKey: bulk ? snapshotKey : POLYGON_ACTIVITY_DATASET_KEY, ...(bulk ? { kind: "bulk" } : {}) }, fetchedAt: "2026-11-07T00:00:00Z" };
    } else if (path === "datasets") throw new Error("Data Explorer must not request wallet datasets.");
    await route.fulfill({ json });
  });
}

test("all ten curated collections show their own metrics and charts without scope selectors", async ({ page }) => {
  await setup(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`/explore?dataset=${userKey}&source=legacy`);
  await expect(page.locator(".axis-catalog-tree > .axis-catalog-group")).toHaveCount(10);
  for (const entry of CURATED_COLLECTIONS) {
    await page.getByRole("button", { name: entry.name, exact: true }).click();
    await expect(page.locator(".axis-catalog-activity .axis-stat")).toHaveCount(1);
    await expect(page.locator(".axis-catalog-activity")).toContainText(titles[entry.id][0]);
    await expect(page.getByRole("heading", { name: titles[entry.id][1], exact: true })).toBeVisible();
    await expect(page.getByLabel("Dataset scope", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Data source", { exact: true })).toHaveCount(0);
    await expect(page.locator(".axis-catalog-published")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("table previews ignore old wallet scope URLs and use the platform Polygon source", async ({ page }) => {
  const previews: string[] = [];
  await setup(page, previews);
  await page.goto(`/explore?view=curated&item=token-transfers&section=tables&dataset=${userKey}`);
  await expect(page.getByRole("table", { name: "tokens.transfers preview" })).toBeVisible();
  expect(previews[0]).toContain(`dataset=${POLYGON_ACTIVITY_DATASET_KEY}`);
  expect(previews[0]).not.toContain(userKey);
  await expect(page.getByLabel("Dataset scope", { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  const chart = page.getByRole("region", { name: "Token transfer activity", exact: true });
  await chart.getByRole("button", { name: "Data", exact: true }).click();
  await expect(chart.getByRole("table", { name: "Exact chart values" })).toContainText("12");
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow at ${width}px`).toBe(true);
  }
});

test("unpublished collection data has no borrowed transfer metrics or charts", async ({ page }) => {
  await setup(page);
  await page.route("**/api/axis/catalog/insights?**", route => route.fulfill({ json: { entryId: "prediction", status: "not-indexed", metrics: [], charts: [] } }));
  await page.goto("/explore?view=curated&item=prediction");
  await expect(page.getByText("No published analytics for this collection yet.", { exact: true })).toBeVisible();
  await expect(page.locator(".axis-catalog-activity .axis-stat")).toHaveCount(0);
  await expect(page.locator(".axis-catalog-activity .axis-analytics")).toHaveCount(0);
});

test("changing collections never displays a delayed response from the previous collection", async ({ page }) => {
  await setup(page);
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  await page.route("**/api/axis/catalog/insights?**", async route => {
    const entry = new URL(route.request().url()).searchParams.get("item")!;
    if (entry === "token-transfers") { started = true; await held; }
    await route.fulfill({ json: insights(entry) });
  });
  await page.goto("/explore");
  await expect.poll(() => started).toBe(true);
  await page.getByRole("button", { name: "Lending & Borrowing", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Lending activity", exact: true })).toBeVisible();
  const completed = page.waitForResponse(response => response.url().includes("catalog/insights?") && response.url().includes("item=token-transfers"));
  release(); await completed;
  await expect(page.getByRole("heading", { name: "Lending activity", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Token transfer activity", exact: true })).toHaveCount(0);
});
