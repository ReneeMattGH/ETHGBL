import { test, expect } from "@playwright/test";
import type { Response } from "@playwright/test";
import type { QueryResult } from "../src/components/axis/shared";

const isQuery = (response: Response, window: string) => response.url().endsWith("/api/axis/query") && response.request().method() === "POST" && response.request().postDataJSON()?.mode === "analytics" && response.request().postDataJSON()?.filters?.lookbackBlocks === window;
test("prebuilt analytics render real quantiles, filter all widgets, refresh and follow verified imports", async ({ page }) => {
  const errors: string[] = [], queries: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (request.url().endsWith("/api/axis/query")) queries.push(request.postData() ?? ""); });
  const initialResponse = page.waitForResponse(response => isQuery(response, "60"));
  await page.goto("/dashboards/prebuilt");
  await expect(page.getByRole("heading", { name: "Polygon USDC · Advanced Activity", exact: true })).toBeVisible({ timeout: 60000 });
  const initial = await (await initialResponse).json() as QueryResult;
  expect(initial.analytics!.transfers).toBeGreaterThan(0);
  await expect(page.locator(".axis-widget")).toHaveCount(12);
  const volume = page.locator(".axis-widget").filter({ has: page.getByRole("heading", { name: "Gross transfer volume", exact: true }) });
  const median = page.locator(".axis-widget").filter({ has: page.getByRole("heading", { name: "Typical transfer size", exact: true }) });
  await expect(volume.getByText(initial.analytics!.amount, { exact: true })).toBeVisible();
  await expect(median.getByText(initial.analytics!.medianAmount!, { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /USDC volume by source block/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Transfer-size distribution/ })).toBeVisible();
  expect(queries.filter(body => JSON.parse(body).filters.lookbackBlocks === "60").length).toBeLessThanOrEqual(3);
  console.log("Twelve real-data widgets loaded with coalesced requests.");
  const narrowedResponse = page.waitForResponse(response => isQuery(response, "1"));
  await page.getByLabel("Rolling source-block window", { exact: true }).selectOption("1");
  const narrowed = await (await narrowedResponse).json() as QueryResult;
  expect(narrowed.scope.fromBlock).toBe(narrowed.scope.toBlock);
  await expect(volume.getByText(narrowed.analytics!.amount, { exact: true })).toBeVisible();
  const refreshedResponse = await page.waitForResponse(response => isQuery(response, "1"), { timeout: 60000 });
  const refreshed = await refreshedResponse.json() as QueryResult;
  expect(refreshed.fetchedAt).not.toBe(narrowed.fetchedAt);
  console.log("A real 30-second refresh re-executed the rolling query.");
  const baseline = BigInt(narrowed.scope.toBlock);
  let advanced = BigInt(refreshed.scope.toBlock) > baseline ? refreshed : null;
  if (!advanced) {
    const response = await page.waitForResponse(async response => {
      if (!isQuery(response, "1") || !response.ok()) return false;
      const data = await response.json() as QueryResult;
      return BigInt(data.scope.toBlock) > baseline;
    }, { timeout: 240000 });
    advanced = await response.json() as QueryResult;
  }
  expect(BigInt(advanced.scope.toBlock)).toBeGreaterThan(baseline);
  await expect(volume.getByText(advanced.analytics!.amount, { exact: true })).toBeVisible();
  console.log("The live window advanced after a real verified incremental import.");
  await page.screenshot({ path: ".axis/screenshots/advanced-dashboard.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(false);
  expect(errors).toEqual([]);
});
