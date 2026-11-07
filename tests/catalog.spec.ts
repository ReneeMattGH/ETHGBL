import { test, expect } from "@playwright/test";

test("curated catalog exposes ten collections and real Arkiv table previews", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/explore");
  await expect(page.locator(".axis-catalog-tree > .axis-catalog-group")).toHaveCount(10);
  await expect(page.getByRole("heading", { name: "Token Transfers", exact: true })).toBeVisible();
  const response = page.waitForResponse(response => response.url().includes("/api/axis/catalog/preview?") && response.url().includes("token-transfers") && response.ok());
  await page.getByRole("tab", { name: "Tables", exact: true }).click();
  const result = await (await response).json();
  expect(result.rows.length).toBeGreaterThan(0);
  await expect(page.getByRole("table", { name: "tokens.transfers preview" })).toContainText(result.rows[0].values.blockNumber);
  await page.getByRole("tab", { name: "Schema", exact: true }).click();
  await expect(page.getByRole("table", { name: "tokens.transfers schema" })).toContainText("amountRaw");
  await page.getByRole("tab", { name: "Provenance", exact: true }).click();
  await expect(page.locator(".axis-catalog-provenance pre")).toContainText("axis.transfer.v1");
  await expect(page.locator(".axis-catalog-provenance pre")).toContainText("$owner = addr(");
  await expect(page.getByLabel("Dataset scope", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "View Arkiv query", exact: true })).toBeVisible();
  await page.getByLabel("Search catalog", { exact: true }).fill("missing-collection");
  await expect(page.locator(".axis-catalog-no-results")).toBeVisible();
  await page.getByRole("button", { name: "Clear catalog search" }).click();
  await page.getByRole("button", { name: "Token Registry & Lists", exact: true }).click();
  await page.getByRole("tab", { name: "Tables", exact: true }).click();
  await expect(page.getByRole("table", { name: "tokens.metadata preview" })).toContainText("USDC");
  expect(errors).toEqual([]);
});

test("Polygon tree, pagination and deep links preserve verified scope", async ({ page }) => {
  await page.goto("/explore?view=chains&item=polygon&table=polygon-blocks&section=tables");
  const table = page.getByRole("table", { name: "polygon.blocks preview" });
  await expect(table).toBeVisible();
  await expect(page.locator(".axis-catalog-table-tree button")).toHaveCount(9);
  await page.getByRole("button", { name: "Polygon", exact: true }).click();
  await expect(page.locator(".axis-catalog-table-tree button")).toHaveCount(0);
  await page.getByRole("button", { name: "Polygon", exact: true }).click();
  await expect(page.locator(".axis-catalog-table-tree button")).toHaveCount(9);
  const first = await table.locator("tbody tr").first().innerText();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(table.locator("tbody tr").first()).not.toHaveText(first);
  await page.getByRole("button", { name: "View Arkiv query", exact: true }).click();
  await expect(page.locator(".axis-catalog-provenance pre")).toContainText(/axis\.(block|bulk\.record)\.v1/);
  await expect(page.locator(".axis-catalog-provenance pre")).toContainText("blockNumber <= u64(");
  await page.getByRole("button", { name: "traces", exact: true }).click();
  await expect(page.getByRole("heading", { name: "This table is not indexed yet" })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Table", { exact: true })).toHaveValue("polygon-traces");
});

test("four protocol trees expose automatic source availability", async ({ page }) => {
  await page.goto("/explore?view=protocols&item=quickswap&source=legacy");
  await expect(page.locator(".axis-catalog-tree > .axis-catalog-group")).toHaveCount(4);
  for (const [name, tables] of [["QuickSwap", 3], ["Uniswap v3", 3], ["Aave v3", 6], ["Polymarket", 4]] as const) {
    const protocol = page.getByRole("button", { name, exact: true });
    if (await protocol.getAttribute("aria-expanded") !== "true") await protocol.click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(page.locator(".axis-catalog-table-tree button")).toHaveCount(tables);
    await expect(page.locator(".axis-catalog-hero + .axis-catalog-meta")).toContainText(/Not indexed|Limited coverage/);
    await expect(page.getByRole("link", { name: "Documentation", exact: true })).toHaveAttribute("target", "_blank");
  }
  await page.getByRole("button", { name: "trade_fills", exact: true }).click();
  await expect(page.getByRole("heading", { name: "This table is not indexed yet" })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.locator(".axis-stat")).toHaveCount(0);
});

test("catalog keyboard navigation and mobile layouts work across all three views", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const hydrated = page.waitForResponse(response => response.url().includes("/api/axis/catalog/source") && response.ok());
  await page.goto("/explore");
  await hydrated;
  await page.getByRole("tab", { name: "Curated", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Chains", exact: true })).toBeFocused();
  await expect(page.getByRole("heading", { name: "Polygon", exact: true })).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByLabel("Search catalog", { exact: true })).toBeFocused();
  for (const route of ["/explore", "/explore?view=chains&item=polygon&table=polygon-blocks&section=tables", "/explore?view=protocols&item=aave-v3&table=aave-borrows&section=tables"]) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(route);
    await expect(page.locator(".axis-catalog-hero h2")).toBeVisible();
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(200);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route} at ${width}px`).toBe(true);
    }
  }
  await page.getByRole("button", { name: /Browse catalog/ }).click();
  await expect(page.getByRole("complementary", { name: "Data catalog", exact: true })).toBeVisible();
  await page.getByLabel("Search catalog", { exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Browse catalog/ })).toBeFocused();
  await expect(page.getByRole("complementary", { name: "Data catalog", exact: true })).not.toBeVisible();
});

test("preview failures show an error without substituting records", async ({ page }) => {
  await page.route("**/api/axis/catalog/preview?**", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Controlled Arkiv outage" }) }));
  await page.goto("/explore?view=chains&item=polygon&table=polygon-blocks&section=tables");
  await expect(page.getByRole("alert").filter({ hasText: "Controlled Arkiv outage" })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.locator(".axis-catalog-tree")).toBeVisible();
});
