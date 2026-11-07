import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { aggregateTransfers } from "../src/lib/axis/core";
import { transferComposition, compositionTimeline } from "../src/lib/axis/catalog-insights";
import { ANALYTICAL_CHART_KINDS, USDC, type Transfer } from "../src/lib/axis/model";
import { transferAttributeFields } from "../src/lib/axis/schemas";
import { exactValue } from "../src/lib/axis/chart-data";

const key = "0x" + "1".repeat(64), dashboardKey = "0x" + "7".repeat(64), owner = "0x" + "a".repeat(40);
const amounts = [0n, 1n, 1000001n, 10000001n, 100000001n, 9007199254740993123n];
const rows: Transfer[] = Array.from({ length: 72 }, (_, index) => {
  const amountRaw = (amounts[index % amounts.length] * BigInt(index + 1)).toString();
  return { sourceId: String(index), chainId: 137, contract: USDC, blockNumber: String(100 + Math.floor(index / 3)), blockHash: key, timestamp: String(1794000000 + Math.floor(index / 3) * 60), txHash: key, txIndex: 0, logIndex: index, sender: "0x" + (index % 30 + 1).toString(16).padStart(40, "0"), recipient: owner, amountRaw, amount: exactValue(BigInt(amountRaw), 6), decimals: 6, contentHash: key };
});
const analytics = aggregateTransfers(rows);
const dataset = { key, owner, creator: owner, writer: owner, name: "Analytical test dataset", description: "", chainId: 137, contract: USDC, enabled: true, continuous: true, createdAt: "2026-11-07T00:00:00Z" };
const coverage = { complete: true, actualRows: rows.length, fromBlock: "100", throughBlock: "123", gaps: [], manifests: [] };
const response = { dataset, coverage, scope: { fromBlock: "100", toBlock: "123", fromTime: null, toTime: null }, total: String(rows.length), analytics, scannedRows: rows.length, executedQuery: "Verified test fixture", blockNumber: "123", fetchedAt: "2026-11-07T00:00:00Z" };

async function setup(page: Page) {
  // Controlled records validate visuals and exact arithmetic; they are never published.
  await page.route("**/api/axis/**", async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace("/api/axis/", "");
    let json: unknown = {};
    if (path === "datasets") json = { datasets: [dataset] };
    else if (path === "catalog/source") json = { dataset };
    else if (path.startsWith("schema/")) json = { datasetKey: key, observed: true, fields: transferAttributeFields };
    else if (path === "query") {
      const input = route.request().postDataJSON();
      json = { ...response, ...(input.mode === "analytics" ? {} : { entities: input.mode === "export" ? rows : rows.slice(input.offset ?? 0, (input.offset ?? 0) + (input.limit ?? 25)) }) };
    } else if (path === "bulk/imports") json = { imports: [] };
    else if (path === "catalog/insights") {
      const entry = url.searchParams.get("item")!;
      const chart = entry === "dex" ? compositionTimeline("DEX trade activity", "Trades", [{ protocol: "QuickSwap", timestamp: "1794000000" }, { protocol: "Uniswap v3", timestamp: "1794000010" }], "protocol") : transferComposition("Token transfer activity", analytics, false);
      json = { entryId: entry, status: "available", metrics: [{ label: entry === "dex" ? "Trades" : "Transfers", value: entry === "dex" ? "2" : String(rows.length) }], charts: [chart] };
    } else if (path === `dashboards/${dashboardKey}`) json = { dashboard: { key: dashboardKey, owner, title: "Legacy dashboard", updatedAt: "2026-11-07T00:00:00Z", document: { version: 1, title: "Legacy dashboard", description: "", refreshMs: 0, widgets: [
      { id: "old-line", title: "Stored activity", kind: "line", metric: "amount", grouping: "time", interval: "minute", width: 2, query: { datasetKey: key, filters: {} } },
      { id: "old-bar", title: "Stored distribution", kind: "bar", metric: "transfers", grouping: "distribution", width: 2, query: { datasetKey: key, filters: {} } },
    ] } } };
    await route.fulfill({ json });
  });
}
async function query(page: Page) {
  await page.goto(`/query?dataset=${key}`);
  await page.getByRole("button", { name: "Execute query", exact: true }).click();
  await page.getByRole("link", { name: "Build dashboard" }).click();
  await expect(page.getByRole("region", { name: "Visual analytics", exact: true })).toBeVisible();
  return page.locator(".axis-insight-chart > .axis-analytics");
}

test("every analytical view renders with no basic chart options or narrow-screen overflow", async ({ page }) => {
  await setup(page);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1100 });
  const chart = await query(page), settings = page.getByRole("complementary", { name: "Visual properties" }).getByLabel("Visualization", { exact: true });
  expect(await settings.locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))).toEqual(["metric", ...ANALYTICAL_CHART_KINDS, "table"]);
  for (const kind of ANALYTICAL_CHART_KINDS) {
    await settings.selectOption(kind);
    await expect(chart).toHaveAttribute("data-chart-kind", kind);
    await expect(chart.locator("svg").first()).toBeVisible();
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), { message: `${kind} overflows at ${width}px` }).toBe(true);
    }
  }
  await page.setViewportSize({ width: 1600, height: 1100 });
  await settings.selectOption("stacked-area");
  await expect(chart.locator(".recharts-area")).toHaveCount(6);
  await page.screenshot({ path: ".axis/analytical-redesign/query-1600.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("legend filtering, exact values and graphic exports preserve complete analytical data", async ({ page }) => {
  await setup(page); await page.setViewportSize({ width: 1600, height: 1100 });
  const chart = await query(page), legend = chart.getByRole("group", { name: "Chart legend" });
  await legend.getByRole("button", { name: "1,000+ USDC", exact: true }).click();
  await expect(legend.getByRole("button", { name: "1,000+ USDC", exact: true })).toHaveAttribute("aria-pressed", "false");
  await chart.getByRole("button", { name: "Data", exact: true }).click();
  await expect(chart.getByRole("table", { name: "Exact chart values" }).locator("tbody tr")).toHaveCount(analytics.blockSeries.length);
  const menu = chart.locator(".axis-chart-export");
  await menu.locator("summary").click();
  const csvDownload = page.waitForEvent("download");
  await menu.getByRole("button", { name: "Download chart CSV" }).click();
  const csv = readFileSync((await (await csvDownload).path())!, "utf8");
  expect(csv).toContain(analytics.blockComposition.at(-1)!.buckets[5].amount);
  expect(csv).toContain("1,000+ USDC");
  await chart.getByRole("button", { name: "Chart", exact: true }).click();
  await legend.getByRole("button", { name: "All", exact: true }).click();
  await expect(chart.locator(".axis-chart-primary strong")).toHaveAttribute("title", analytics.amount.replace(/\B(?=(\d{3})+(?!\d))/g, ",").split(".")[0] + (analytics.amount.includes(".") ? "." + analytics.amount.split(".")[1] : ""));
  for (const format of ["SVG", "PNG"]) {
    const download = page.waitForEvent("download");
    await menu.getByRole("button", { name: `Download ${format}`, exact: true }).click();
    const file = await download, data = readFileSync((await file.path())!);
    expect(data.length).toBeGreaterThan(1000);
    if (format === "PNG") expect(data.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    else expect(data.toString()).toContain("1,000+ USDC");
  }
  await chart.getByRole("button", { name: "Expand chart", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("allocation and matrix visuals expose exact values to keyboard users", async ({ page }) => {
  await setup(page); const chart = await query(page);
  const settings = page.getByRole("complementary", { name: "Visual properties" }).getByLabel("Visualization", { exact: true });
  await settings.selectOption("treemap");
  await chart.locator(".axis-mosaic g[role=button]").first().focus();
  await expect(chart.locator(".axis-plot-tip .axis-chart-tooltip")).toBeVisible();
  await settings.selectOption("heatmap");
  await chart.getByRole("button", { name: /Block .*Zero:/ }).first().focus();
  await expect(chart.locator(".axis-heatmap-tip")).toContainText("Zero");
  await settings.selectOption("ranked");
  await chart.locator(".axis-ranking g[role=button]").first().focus();
  await expect(chart.locator(".axis-plot-tip .axis-chart-tooltip")).toBeVisible();
});

test("catalogs use true multi-series composition and sparse snapshots do not invent a trend", async ({ page }) => {
  await setup(page); await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/explore");
  const chart = page.locator(".axis-catalog-activity .axis-analytics");
  await expect(chart).toHaveAttribute("data-chart-kind", "stacked-area");
  await expect(chart.locator(".recharts-area")).toHaveCount(6);
  await expect(chart.locator(".recharts-line")).toHaveCount(0);
  await page.screenshot({ path: ".axis/analytical-redesign/catalog-1600.png", fullPage: true });
  await page.goto("/explore?view=curated&item=dex");
  await expect(page.getByRole("group", { name: "Composition of the observed interval" })).toBeVisible();
  await expect(page.locator(".axis-catalog-activity .recharts-cartesian-axis")).toHaveCount(0);
});

test("saved legacy charts and builder settings use analytical presentations", async ({ page }) => {
  await setup(page); await page.goto(`/dashboards/${dashboardKey}`);
  await expect(page.locator('.axis-report-visual [data-chart-kind="stacked-area"]')).toBeVisible();
  await expect(page.locator('.axis-report-visual [data-chart-kind="treemap"]')).toBeVisible();
  await page.goto(`/dashboards/new?dataset=${key}&chart=stacked-area&grouping=time&interval=minute&measure=amount`);
  await expect(page.getByLabel("Visualization", { exact: true })).toHaveValue("stacked-area");
  await page.getByLabel("Visualization", { exact: true }).selectOption("ranked");
  await expect(page.getByLabel("Grouping", { exact: true })).toHaveValue("distribution");
  await expect(page.getByLabel("Visualization", { exact: true }).locator('option[value="line"], option[value="bar"]')).toHaveCount(0);
});
