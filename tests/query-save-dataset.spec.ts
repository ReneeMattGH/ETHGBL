import { expect, test } from "@playwright/test";

const datasetKey = `0x${"1".repeat(64)}`, owner = `0x${"a".repeat(40)}`;
const dataset = { key: datasetKey, owner, writer: owner, name: "USDC transfers", chainId: 137, contract: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", startBlock: "10", endBlock: "0", enabled: true, continuous: true };

test("save as dataset stays visible and only enables for the current successful query", async ({ page }) => {
  // Controlled responses verify UI states; wallet publishing is covered separately in unit tests.
  let release = () => {};
  let held: Promise<void> | null = null;
  let fail = false;
  const requests: { mode: string; filters: Record<string, unknown> }[] = [];
  await page.route("**/api/axis/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/api/axis/", "");
    if (path === "datasets") return route.fulfill({ json: { datasets: [dataset] } });
    if (path.startsWith("schema/")) return route.fulfill({ json: { datasetKey, observed: true, fields: [{ name: "sender", type: "addr", indexed: true }] } });
    if (path === "query") {
      const body = route.request().postDataJSON(); requests.push(body);
      if (held) await held;
      if (fail) return route.fulfill({ status: 503, json: { error: "Query unavailable" } });
      return route.fulfill({ json: { dataset, entities: [], total: "0", coverage: { throughBlock: "20", complete: true, actualRows: 0, gaps: [] }, scope: { fromBlock: "10", toBlock: "20" }, executedQuery: "Verified query", blockNumber: "1", fetchedAt: "2026-11-07T00:00:00Z" } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/query");
  const save = page.getByRole("button", { name: "Save as dataset", exact: true });
  await expect(save).toBeVisible();
  await expect(save).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save query to Arkiv" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "My queries" })).toHaveCount(0);
  await page.getByLabel("Dataset", { exact: true }).selectOption(datasetKey);
  await expect(page.getByLabel("Sender address", { exact: true })).toBeVisible();
  await expect(save).toBeDisabled();

  held = new Promise<void>(resolve => { release = resolve; });
  await page.getByRole("button", { name: "Execute query", exact: true }).click();
  await expect(page.getByRole("button", { name: "Executing" })).toBeVisible();
  await expect(save).toBeVisible();
  await expect(save).toBeDisabled();
  release(); held = null;
  await expect(save).toBeDisabled(); // A name is required even after a successful query.
  await page.getByLabel("Dataset name", { exact: true }).fill("   ");
  await expect(save).toBeDisabled();
  await page.getByLabel("Dataset name", { exact: true }).fill("Treasury activity");
  await expect(save).toBeEnabled();
  await page.getByLabel("Sender address", { exact: true }).fill(owner);
  await expect(save).toBeDisabled();

  fail = true;
  await page.getByRole("button", { name: "Execute query", exact: true }).click();
  await expect(page.getByRole("alert").first()).toContainText("Query unavailable");
  await expect(save).toBeVisible();
  await expect(save).toBeDisabled();
  fail = false;
  await page.getByRole("button", { name: "Execute query", exact: true }).click();
  await expect(save).toBeEnabled();
  await save.click();
  await expect.poll(() => requests.filter(request => request.mode === "export").length).toBe(1);
  expect(requests.at(-1)?.filters).toEqual({ sender: owner, order: "desc" });
  await expect(page.locator(".axis-query-main [role=alert]")).toContainText("Install an Ethereum browser wallet");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(save).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `.axis/screenshots/save-as-dataset-${width}.png`, fullPage: true });
  }
  await page.getByLabel("Dataset", { exact: true }).selectOption("");
  await expect(save).toBeVisible();
  await expect(save).toBeDisabled();
});
