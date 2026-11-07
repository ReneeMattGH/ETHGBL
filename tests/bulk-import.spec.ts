import { test, expect } from "@playwright/test";

test("real published imports expose verified chain and protocol records", async ({ page, request }) => {
  let importKey = "";
  await expect.poll(async () => {
    const response = await request.get("/api/axis/bulk/imports");
    if (!response.ok()) return false;
    const body = await response.json();
    const imported = body.imports.find((item: { document: { runId: string; recordCount: number } }) => item.document.runId === "aave-live-pilot-v1" && item.document.recordCount > 0);
    importKey = imported?.key ?? ""; return Boolean(importKey);
  }, { timeout: 300_000, intervals: [5000] }).toBe(true);
  const response = await request.get(`/api/axis/catalog/preview?table=aave-withdrawals&import=${importKey}`);
  expect(response.ok()).toBe(true); const preview = await response.json(); expect(preview.total).toBe("1"); expect(preview.rows[0].values.event).toBe("Withdraw");
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/explore?view=protocols&item=aave-v3&table=aave-withdrawals&section=tables&import=${importKey}`);
  await expect(page.getByLabel("Data source", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("table", { name: "aave_v3.withdrawals preview" })).toContainText(preview.rows[0].values.amount);
  await page.getByRole("tab", { name: "Provenance", exact: true }).click();
  await expect(page.locator(".axis-catalog-provenance pre")).toContainText("axis.bulk.record.v1");
  await expect(page.locator(".axis-catalog-provenance pre")).toContainText(`importKey = key(${importKey})`);
  await page.goto(`/explore?view=chains&item=polygon&table=polygon-logs&section=tables&import=${importKey}`);
  await expect(page.getByRole("table", { name: "polygon.logs preview" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/ingestion"); await expect(page.getByRole("table", { name: "Arkiv stored data", exact: true })).toContainText("polygon.blocks");
  expect(errors).toEqual([]);
});
