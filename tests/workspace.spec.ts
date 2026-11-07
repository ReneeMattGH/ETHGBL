import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const evidence = JSON.parse(readFileSync(".axis/live-evidence.json", "utf8")) as { datasetKey: string; fromBlock: string; toBlock: string };

test("workspace navigation and every internal layout fit desktop, tablet and mobile", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "Axis analytics workspace" })).toBeVisible();
  const expandedWidth = await page.locator(".axis-sidebar").evaluate(element => element.getBoundingClientRect().width);
  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(page.locator(".axis-sidebar")).toHaveCSS("width", "76px");
  expect(expandedWidth).toBe(224);
  await page.getByRole("link", { name: "Query Studio", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Query Studio", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Expand navigation" }).click();

  const routes = ["/overview", "/explore", "/datasets", "/datasets/new", `/datasets/${evidence.datasetKey}`, "/query", "/dashboards", "/dashboards/new", "/dashboards/prebuilt", "/ingestion", "/settings"];
  for (const route of routes) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60000 });
    await expect(page.locator(".axis-layout:visible")).toHaveCSS("font-family", /Geist/);
    await expect(page.locator(".axis-layout:visible button").first()).toHaveCSS("font-family", /Geist/);
    if (route === "/dashboards/prebuilt") await expect(page).toHaveURL(/\/dashboards$/);
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width < 650 ? 844 : 1000 });
      await page.waitForTimeout(180);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route} overflows at ${width}px`).toBe(true);
    }
  }
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await expect(page.getByRole("link", { name: "AXIS Arkiv analytics", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Settings", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeFocused();
  await expect(page.getByRole("navigation", { name: "Primary" })).not.toBeVisible();
  expect(errors).toEqual([]);
});

test("compact query results preserve real records, provenance and keyboard inspection", async ({ page }) => {
  await page.goto(`/query?dataset=${evidence.datasetKey}`);
  await page.getByRole("button", { name: "Execute query", exact: true }).click();
  await expect(page.getByRole("table", { name: "Verified transfers" })).toBeVisible({ timeout: 60000 });
  const inspect = page.getByRole("button", { name: /Inspect log/ }).first();
  await inspect.click();
  await expect(page.getByRole("dialog", { name: "Transfer details" })).toBeVisible();
  await page.getByText("Raw record", { exact: true }).click();
  await expect(page.getByRole("dialog").locator("pre")).toContainText('"amountRaw"');
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(inspect).toBeFocused();
  await page.getByText("Query & provenance", { exact: true }).click();
  await expect(page.locator(".axis-evidence pre")).toContainText(evidence.datasetKey);
  await page.screenshot({ path: ".axis/workspace-redesign/query-desktop.png", fullPage: true });
});

test("builder, dataset tabs and ingestion disclosure retain their working controls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const filters = encodeURIComponent(JSON.stringify({ fromBlock: evidence.fromBlock, toBlock: evidence.toBlock }));
  await page.goto(`/dashboards/new?dataset=${evidence.datasetKey}&filters=${filters}`);
  await page.getByLabel("Dashboard title", { exact: true }).fill("Local layout review");

  await expect(page.locator(".axis-report-grid > .axis-report-visual")).toHaveCount(8);
  const inspector = await page.locator(".axis-report-filters").boundingBox();
  const canvas = await page.locator(".axis-report-canvas").boundingBox();
  expect(canvas!.x).toBeGreaterThan(inspector!.x + inspector!.width);
  await expect(page.getByRole("button", { name: "Publish dashboard to Arkiv" })).toBeEnabled();
  await expect(page.locator(".axis-report-metric strong").first()).not.toBeEmpty({ timeout: 60000 });
  await page.screenshot({ path: ".axis/workspace-redesign/builder-desktop.png", fullPage: true });
  while (await page.locator(".axis-report-grid > .axis-report-visual").count()) await page.locator(".axis-report-canvas").getByRole("button", { name: /^Remove / }).first().click();
  await expect(page.getByRole("button", { name: "Publish dashboard to Arkiv" })).toBeDisabled();
  await page.goto(`/datasets/${evidence.datasetKey}`);
  await page.getByRole("tab", { name: "Transfers", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Schema", exact: true })).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText("Observed Arkiv field types");
  await page.getByRole("tab", { name: "Coverage", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Verified coverage manifests");
  await page.goto("/ingestion");
  await expect(page.getByRole("table", { name: "Arkiv stored data" })).toBeVisible();
  await expect(page.getByText("Rows stored on Arkiv", { exact: true })).toBeVisible();
  await page.goto("/settings");
  await expect(page.locator(".axis-reference[open]")).toHaveCount(0);
  await page.getByText("Local runtime", { exact: true }).click();
  await expect(page.locator(".axis-reference[open]")).toContainText("npm.cmd run worker");
});
