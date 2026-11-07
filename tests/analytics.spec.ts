import { test, expect, type Page, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ANALYTICAL_CHART_KINDS as CHART_KINDS } from "../src/lib/axis/model";
import { POLYGON_ACTIVITY_DATASET_KEY } from "../src/lib/axis/catalog-sources";

const evidence = JSON.parse(readFileSync(".axis/live-evidence.json", "utf8")) as { datasetKey: string; fromBlock: string; toBlock: string };
test.beforeEach(async ({ request }) => {
  const response = await request.get("/api/axis/datasets");
  const body = await response.json();
  const dataset = body.datasets?.find((dataset: { key: string }) => dataset.key !== POLYGON_ACTIVITY_DATASET_KEY);
  test.skip(!dataset, "This live suite needs a user-queryable Arkiv dataset.");
  evidence.datasetKey = dataset.key;
});
async function query(page: Page) {
  await page.goto(`/query?dataset=${evidence.datasetKey}`);
  const response = page.waitForResponse(response => response.url().endsWith("/api/axis/query") && response.request().postDataJSON()?.mode === "analytics", { timeout: 180000 });
  await page.getByRole("button", { name: "Execute query", exact: true }).click();
  await page.getByRole("link", { name: "Build dashboard" }).click();
  const result = await response, data = await result.json();
  expect(result.ok(), data.error ?? "Arkiv analytics request failed").toBe(true);
  await expect(page.getByRole("region", { name: "Visual analytics", exact: true })).toBeVisible({ timeout: 60000 });
  return data;
}
const primary = (page: Page) => page.locator(".axis-insight-chart > .axis-analytics");
async function exportFile(page: Page, chart: Locator, label: string) {
  const menu = chart.locator(".axis-chart-export").first();
  if (!await menu.evaluate(element => (element as HTMLDetailsElement).open)) await menu.locator("summary").click();
  const download = page.waitForEvent("download");
  await menu.getByRole("button", { name: label, exact: true }).click();
  return await download;
}

test("real Arkiv analytics render every chart type and preserve exact values", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1600, height: 1100 });
  const result = await query(page);
  expect(result.analytics.blockComposition.length).toBeGreaterThan(0);
  const rows = result.analytics.blockComposition.flatMap((point: { buckets: { amountRaw: string }[] }) => point.buckets);
  expect(rows.reduce((sum: bigint, item: { amountRaw: string }) => sum + BigInt(item.amountRaw), 0n).toString()).toBe(result.analytics.amountRaw);
  for (const kind of CHART_KINDS) {
    await page.getByLabel("Visualization", { exact: true }).selectOption(kind);
    await expect(primary(page)).toHaveAttribute("data-chart-kind", kind);
    await expect(primary(page).locator("svg").first()).toBeVisible();
    if (kind === "donut") {
      await expect(primary(page).locator(".recharts-pie-sector").first()).toBeVisible();
      const sectors = await primary(page).locator("path.recharts-sector:visible").all();
      const bounds = await Promise.all(sectors.map(sector => sector.boundingBox()));
      const largest = bounds.reduce((best, box, index) => (box?.width ?? 0) * (box?.height ?? 0) > (bounds[best]?.width ?? 0) * (bounds[best]?.height ?? 0) ? index : best, 0);
      await sectors[largest].scrollIntoViewIfNeeded();
      const hit = await sectors[largest].evaluate(element => {
        const path = element as SVGGeometryElement, box = path.getBBox(), matrix = path.getScreenCTM();
        if (!matrix) return null;
        for (let x = .05; x < 1; x += .05) for (let y = .05; y < 1; y += .05) {
          const point = new DOMPoint(box.x + box.width * x, box.y + box.height * y);
          if (!path.isPointInFill(point)) continue;
          const screen = point.matrixTransform(matrix);
          if (document.elementFromPoint(screen.x, screen.y) === path) return { x: screen.x, y: screen.y };
        }
        return null;
      });
      expect(hit).not.toBeNull(); await page.mouse.move(hit!.x, hit!.y);
      await expect(primary(page).locator(".axis-chart-tooltip")).toContainText("%");
    }
    if (kind === "heatmap") {
      const cell = primary(page).getByRole("button", { name: /Block .*Zero:/ }).first();
      await cell.focus(); await expect(primary(page).locator(".axis-heatmap-tip")).toContainText("Zero");
    }
  }
  await page.getByLabel("Visualization", { exact: true }).selectOption("stacked-area");
  await primary(page).getByRole("button", { name: "Data", exact: true }).click();
  await expect(primary(page).getByRole("table", { name: "Exact chart values" })).toContainText(result.analytics.blockComposition[0].blockNumber);
  const file = await exportFile(page, primary(page), "Download chart CSV");
  expect(file.suggestedFilename()).toBe("axis-chart-data.csv");
  const csv = readFileSync((await file.path())!, "utf8");
  expect(csv).toContain(result.analytics.blockComposition[0].buckets[0].amount);
  expect(csv).toContain(result.analytics.blockComposition[0].blockNumber);
  expect(errors).toEqual([]);
});

test("legends, full-dataset values, exact tooltips, expanded charts and graphic exports work", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await query(page);
  const chart = primary(page), legend = chart.getByRole("group", { name: "Chart legend" });
  const large = legend.getByRole("button", { name: "1,000+ USDC", exact: true });
  await large.click(); await expect(large).toHaveAttribute("aria-pressed", "false");
  await legend.getByRole("button", { name: "All", exact: true }).click(); await expect(large).toHaveAttribute("aria-pressed", "true");
  const shapes = await chart.locator("path.recharts-area-area:visible").all();
  const bounds = await Promise.all(shapes.map(shape => shape.boundingBox()));
  const shape = shapes[bounds.reduce((best, box, index) => (box?.height ?? 0) > (bounds[best]?.height ?? 0) ? index : best, 0)];
  await shape.hover(); await expect(chart.locator(".axis-chart-tooltip")).toContainText("Visible total");
  await expect(chart.getByLabel("Chart range start", { exact: true })).toHaveCount(0);
  await expect(chart.getByLabel("Chart range end", { exact: true })).toHaveCount(0);
  await expect(chart.getByRole("button", { name: "Zoom in chart", exact: true })).toHaveCount(0);
  for (const [label, extension] of [["Download SVG", "svg"], ["Download PNG", "png"]]) {
    const download = await exportFile(page, chart, label);
    expect(download.suggestedFilename()).toBe(`axis-chart.${extension}`);
    const bytes = readFileSync((await download.path())!); expect(bytes.length).toBeGreaterThan(1000);
    if (extension === "png") { expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a"); await download.saveAs(".axis/workspace-redesign/advanced-chart-export.png"); }
    else { expect(bytes.toString()).toContain("Arkiv query"); expect(bytes.toString()).toContain("recharts-surface"); expect(bytes.toString()).toContain("1,000+ USDC"); }
  }
  await chart.getByRole("button", { name: "Expand chart", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: ".axis/workspace-redesign/advanced-chart-expanded.png", fullPage: true });
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(chart.getByRole("button", { name: "Expand chart", exact: true })).toBeFocused();
});

test("builder restores advanced chart settings and passes the same definitions to the public viewer", async ({ page }) => {
  const filters = { fromBlock: evidence.fromBlock, toBlock: evidence.toBlock };
  await page.goto(`/dashboards/new?${new URLSearchParams({ dataset: evidence.datasetKey, filters: JSON.stringify(filters), chart: "share-area", grouping: "time", interval: "minute", measure: "amount", chartTitle: "Volume share" })}`);
  await expect(page.getByLabel("Visualization", { exact: true })).toHaveValue("share-area");
  await expect(page.getByLabel("Time interval", { exact: true })).toHaveValue("minute");
  await page.getByLabel("Dashboard title", { exact: true }).fill("Local chart verification");

  await expect(page.locator(".axis-report-grid > .axis-report-visual")).toHaveCount(8);
  await page.getByRole("button", { name: "Save local draft", exact: true }).click();
  const document = await page.evaluate(() => JSON.parse(localStorage.getItem("axis:dashboard-draft:v1")!));
  expect(document.widgets.find((widget: { id: string }) => widget.id === "activity")).toMatchObject({ kind: "share-area", interval: "minute", grouping: "time", query: { datasetKey: evidence.datasetKey, filters: { order: "desc" } } });
  await page.reload(); await page.getByRole("button", { name: "Restore draft", exact: true }).click();
  await expect(page.locator(".axis-report-grid > .axis-report-visual")).toHaveCount(8);
  // Only the definition response is controlled here. All widget query data still comes from real Arkiv reads.
  const key = "0x" + "7".repeat(64);
  await page.route(`**/api/axis/dashboards/${key}`, route => route.fulfill({ json: { dashboard: { key, owner: "0x" + "1".repeat(40), expiresAt: "999999999", title: document.title, document, updatedAt: new Date().toISOString() } } }));
  await page.goto(`/dashboards/${key}`);
  await expect(page.locator('.axis-report-visual [data-chart-kind="share-area"]')).toBeVisible({ timeout: 90000 });
  await expect(page.getByRole("heading", { name: "Volume share", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeVisible();
});

test("catalog composition and all analytical query views fit narrow screens", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/explore");
  const collection = page.locator(".axis-catalog-activity");
  await expect(collection.locator('[data-chart-kind="stacked-area"]')).toBeVisible({ timeout: 180000 });
  await expect(collection.locator('[data-chart-kind="ranked"]')).toBeVisible();
  await expect(page.getByLabel("Dataset scope", { exact: true })).toHaveCount(0);
  await query(page);
  for (const kind of CHART_KINDS) {
    await page.getByLabel("Visualization", { exact: true }).selectOption(kind);
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${kind} at ${width}px`).toBe(true);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByLabel("Visualization", { exact: true }).selectOption("stacked-area");
  await page.screenshot({ path: ".axis/workspace-redesign/advanced-query-desktop.png", fullPage: true });
  await expect(primary(page)).toHaveAttribute("data-chart-kind", "stacked-area");
  expect(errors).toEqual([]);
});
