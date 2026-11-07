import { expect, test } from "@playwright/test";

// Catalog fixtures only: these tests never publish definitions or sign transactions.
const owner = `0x${"a".repeat(40)}`;
const dashboards = [
  { key: `0x${"1".repeat(64)}`, owner, title: "Alpha transfers", updatedAt: "2026-11-01T12:00:00Z", document: { description: "Verified token activity", widgets: [{ kind: "line" }], refreshMs: 0 } },
  { key: `0x${"2".repeat(64)}`, owner: `0x${"b".repeat(40)}`, title: "Zeta volume", updatedAt: "2026-11-06T12:00:00Z", document: { description: "Gross transfer volume", widgets: [{ kind: "metric" }, { kind: "bar" }], refreshMs: 30000 } },
];

test("empty library and wallet filter remain usable across viewport sizes", async ({ page }) => {
  await page.route("**/api/axis/dashboards", route => route.fulfill({ json: { dashboards: [] } }));
  await page.goto("/dashboards");
  await expect(page.getByRole("heading", { name: "No dashboards yet." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create a dashboard", exact: true })).toHaveAttribute("href", "/dashboards/new");
  await expect(page.getByRole("link", { name: "Start with a query" })).toHaveAttribute("href", "/query");
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByRole("heading", { name: "Dashboards", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow at ${width}px`).toBe(true);
    const search = page.getByRole("searchbox", { name: "Search dashboards" });
    await expect(search).toBeVisible();
    if (width === 1440 || width === 390) await page.screenshot({ path: `.axis/dashboard-redesign/empty-${width}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "My dashboards" }).click();
  await expect(page.getByRole("heading", { name: "Connect your wallet" })).toBeVisible();
  await expect(page.locator(".axis-library-empty").getByRole("button", { name: "Connect wallet" })).toBeVisible();
  await page.getByRole("button", { name: /All dashboards/ }).click();
  await page.getByRole("searchbox").fill("missing");
  await expect(page.getByRole("heading", { name: "No matching dashboards." })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.getByRole("heading", { name: "No dashboards yet." })).toBeVisible();
});

test("published cards support search, sorting, list view and refresh", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  let requests = 0;
  await page.route("**/api/axis/dashboards", route => { requests++; return route.fulfill({ json: { dashboards } }); });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboards");
  const cards = page.locator(".axis-library-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("Zeta volume");
  await page.getByLabel("Sort dashboards").selectOption("title");
  await expect(cards.first()).toContainText("Alpha transfers");
  await page.getByRole("searchbox").fill("  VERIFIED  ");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute("href", `/dashboards/${dashboards[0].key}/edit`);
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(cards).toHaveCount(2);
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.locator(".axis-library-cards")).toHaveClass(/is-list/);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `List overflow at ${width}px`).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Grid view" }).click();
  await page.screenshot({ path: ".axis/dashboard-redesign/populated-1440.png", fullPage: true });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect.poll(() => requests).toBeGreaterThan(1);
  await expect(cards).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("failed reads show an error and can recover without an empty-state claim", async ({ page }) => {
  let fail = true;
  await page.route("**/api/axis/dashboards", route => route.fulfill(fail ? { status: 503, json: { error: "Catalog temporarily unavailable" } } : { json: { dashboards: [] } }));
  await page.goto("/dashboards");
  await expect(page.locator(".axis-library-panel").getByRole("alert")).toContainText("Catalog temporarily unavailable");
  await expect(page.getByRole("heading", { name: "Dashboards are unavailable" })).toBeVisible();
  await expect(page.getByText("No dashboards yet.", { exact: false })).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "No dashboards yet." })).toBeVisible();
});
