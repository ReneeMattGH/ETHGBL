import { expect, test, type Page } from "@playwright/test";

const owner = `0x${"a".repeat(40)}`;
const other = `0x${"b".repeat(40)}`;
const rows = [
  { key: `0x${"1".repeat(64)}`, owner, name: "Treasury transfers", description: "Treasury USDC activity", enabled: true, createdAt: "2026-11-07T00:00:00Z" },
  { key: `0x${"2".repeat(64)}`, owner, name: "Settlement records", description: "Settlement monitoring", enabled: false, createdAt: "2026-11-06T00:00:00Z" },
  { key: `0x${"3".repeat(64)}`, owner: other, name: "Another wallet dataset", description: "", enabled: true, createdAt: "2026-11-07T00:00:00Z" },
].map(row => ({ ...row, creator: row.owner, writer: other, contract: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", chainId: 137, continuous: true, startBlock: "100", endBlock: "0", expiresAt: "999999999" }));

async function connectFixtureWallet(page: Page) {
  // Simulated wallet and API responses; no signatures, publishing or live imports.
  await page.addInitScript(address => {
    window.ethereum = {
      request: async ({ method }) => method === "eth_accounts" || method === "eth_requestAccounts" ? [address] : null,
      on: (event, handler) => { if (event === "accountsChanged") window.addEventListener("test-wallet-change", event => handler((event as CustomEvent).detail)); },
      removeListener: () => {},
    };
  }, owner);
}

test("disconnected visitors can connect without requesting datasets", async ({ page }) => {
  let reads = 0;
  await page.route("**/api/axis/datasets?*", route => { reads++; return route.fulfill({ json: { datasets: rows } }); });
  await page.goto("/datasets");
  await expect(page.getByRole("heading", { name: "My datasets", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Connect your wallet" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "My datasets" })).toHaveAttribute("aria-current", "page");
  expect(reads).toBe(0);
});

test("wallet-owned datasets support search, definition filters and navigation on every screen size", async ({ page }) => {
  await connectFixtureWallet(page);
  const owners: string[] = [];
  await page.route("**/api/axis/datasets?*", route => { owners.push(new URL(route.request().url()).searchParams.get("owner")!); return route.fulfill({ json: { datasets: rows } }); });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/datasets");
  const cards = page.locator(".axis-owned-cards .axis-library-dataset");
  await expect(cards).toHaveCount(2);
  await expect(page.getByText("Another wallet dataset", { exact: true })).toHaveCount(0);
  expect(owners).toEqual([owner]);
  await expect(page.getByRole("link", { name: "Query Treasury transfers", exact: true })).toHaveAttribute("href", `/query?dataset=${rows[0].key}`);
  await expect(page.getByRole("link", { name: "Open Treasury transfers", exact: true })).toHaveAttribute("href", `/datasets/${rows[0].key}`);
  await page.getByLabel("Dataset status").selectOption("paused");
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText("Settlement records");
  await page.getByLabel("Dataset status").selectOption("all");
  await page.getByRole("searchbox").fill("  TREASURY  ");
  await expect(cards).toHaveCount(1);
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(cards).toHaveCount(2);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Page overflows at ${width}px`).toBe(true);
    await expect(page.getByRole("link", { name: "Open Treasury transfers", exact: true })).toBeVisible();
    if (width === 1440 || width === 390) await page.screenshot({ path: `.axis/my-datasets/list-${width}.png`, fullPage: true });
  }
  await page.getByRole("searchbox").fill("not present");
  await expect(page.getByRole("heading", { name: "No matching datasets" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(cards).toHaveCount(2);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect.poll(() => owners.length).toBeGreaterThan(1);
});

test("switching or disconnecting a wallet immediately removes the previous wallet's list", async ({ page }) => {
  await connectFixtureWallet(page);
  await page.route("**/api/axis/datasets?*", route => route.fulfill({ json: { datasets: rows } }));
  await page.goto("/datasets");
  await expect(page.getByRole("link", { name: "Open Treasury transfers", exact: true })).toBeVisible();
  await page.evaluate(address => window.dispatchEvent(new CustomEvent("test-wallet-change", { detail: [address] })), other);
  await expect(page.getByRole("link", { name: "Open Another wallet dataset", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Treasury transfers", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connect your wallet" })).toBeVisible();
  await expect(page.locator(".axis-owned-cards .axis-library-dataset")).toHaveCount(0);
});

test("an empty wallet list and a failed read show distinct states", async ({ page }) => {
  await connectFixtureWallet(page);
  let fail = true;
  await page.route("**/api/axis/datasets?*", route => route.fulfill(fail ? { status: 503, json: { error: "Dataset read unavailable" } } : { json: { datasets: [] } }));
  await page.goto("/datasets");
  await expect(page.getByRole("heading", { name: "Datasets are unavailable" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No datasets yet" })).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "No datasets yet" })).toBeVisible();
});
