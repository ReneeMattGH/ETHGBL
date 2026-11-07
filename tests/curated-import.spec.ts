import { test, expect } from "@playwright/test";

test("published curated records retain exact identities, real counts and unavailable trace coverage", async ({ page, request }) => {
  test.setTimeout(720_000);
  let importKey = "";
  await expect.poll(async () => {
    const response = await request.get("/api/axis/bulk/imports");
    if (!response.ok()) return false;
    const body = await response.json();
    const imported = body.imports.find((item: { status: string; document: { runId: string; recordCount: number } }) => item.document.runId === "curated-pilot-v2" && item.status === "complete" && item.document.recordCount > 0);
    importKey = imported?.key ?? ""; return Boolean(importKey);
  }, { timeout: 600_000, intervals: [10000] }).toBe(true);
  for (const [table, count] of [["token-lists", 197], ["aave-reserves", 21], ["polymarket-trade_fills", 41], ["polymarket-redemptions", 13], ["polymarket-outcome_tokens", 4]] as const) {
    const response = await request.get(`/api/axis/catalog/preview?table=${table}&import=${importKey}`);
    expect(response.ok()).toBe(true); const result = await response.json(); expect(Number(result.total)).toBe(count);
    expect(result.sourceScope).toContain("Selected physical tables");
    if (table === "polymarket-outcome_tokens") {
      expect(result.rows.every((row: { values: { sourceId: string; tokenId: string; sourceIdentity: string } }) => Buffer.byteLength(row.values.sourceId) <= 128 && /^\d+$/.test(row.values.tokenId) && row.values.sourceIdentity.length > 128)).toBe(true);
    }
  }
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/explore?view=curated&item=token-registry&table=token-lists&section=tables&import=${importKey}`);
  await expect(page.getByRole("table", { name: "tokens.lists preview" })).toContainText("Uniswap Labs Default");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto(`/explore?view=chains&item=polygon&table=polygon-traces&section=tables&import=${importKey}`);
  await expect(page.getByText(/not available on the Free tier/)).toBeVisible();
  expect(errors).toEqual([]);
});
