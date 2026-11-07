import { test, expect } from "@playwright/test";

test("monitor shows stored counts and a table breakdown without staging or job controls", async ({ page }) => {
  await page.route("**/api/axis/ingestion/counts", route => route.fulfill({ json: {
    rows: "6124", blocks: "1124", fetchedAt: "2026-11-07T00:00:00Z",
    tables: [{ id: "token-transfers", name: "tokens.transfers", rows: "5000" }, { id: "polygon-blocks", name: "polygon.blocks", rows: "1124" }],
  } }));
  await page.goto("/ingestion");
  await expect(page.locator(".axis-ingestion-stats")).toContainText("6,124");
  await expect(page.locator(".axis-ingestion-stats")).toContainText("1,124");
  await expect(page.getByRole("table", { name: "Arkiv stored data" })).toContainText("tokens.transfers");
  await expect(page.getByText("Worker", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Filter ingestion jobs" })).toHaveCount(0);
  await expect(page.getByText("Staged source rows", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(1);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});

test("monitor reports count failures without invented zero totals", async ({ page }) => {
  await page.route("**/api/axis/ingestion/counts", route => route.fulfill({ status: 503, json: { error: "Arkiv counts unavailable" } }));
  await page.goto("/ingestion");
  await expect(page.getByRole("alert").filter({ hasText: "Arkiv counts unavailable" })).toBeVisible();
  await expect(page.locator(".axis-ingestion-stats strong")).toHaveText(["—", "—", "—"]);
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("live monitor displays counts returned by Arkiv", async ({ page }) => {
  const response = page.waitForResponse(r => r.url().includes("/api/axis/ingestion/counts") && r.ok());
  await page.goto("/ingestion");
  const counts = await (await response).json();
  expect(counts.tables.reduce((sum: bigint, table: { rows: string }) => sum + BigInt(table.rows), 0n).toString()).toBe(counts.rows);
  await expect(page.locator(".axis-ingestion-stats strong").first()).toHaveText(BigInt(counts.rows).toLocaleString("en-US"));
  await expect(page.getByRole("table", { name: "Arkiv stored data" })).toBeVisible();
});
