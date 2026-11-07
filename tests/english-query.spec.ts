import { expect, test, type Page } from "@playwright/test";
const key = "0x" + "1".repeat(64), other = "0x" + "2".repeat(64), owner = "0x" + "a".repeat(40);
const datasets = [key, other].map((key, index) => ({ key, owner, writer: owner, name: index ? "Settlement records" : "Treasury transfers", chainId: 137, contract: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", enabled: true }));
const filters = { conditions: [{ field: "amountRaw", operator: ">=", value: "100000001" }], order: "asc" };
const preview = { status: "ready", summary: "USDC transfers above 100 USDC, oldest first.", questions: [], queries: [{ datasetKey: key, filters }], nativeQuery: "trusted dataset scope AND amountRaw >= u256(100000001) ORDER BY blockNumber:u64 ASC", generatedAt: "2026-11-07T00:00:00Z" };
async function setup(page: Page, configured = true) {
  const executed: Record<string, unknown>[] = [], translations: Record<string, unknown>[] = [];
  await page.route("**/api/axis/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/api/axis/", "");
    if (path === "datasets") return route.fulfill({ json: { datasets } });
    if (path.startsWith("schema/")) return route.fulfill({ json: { datasetKey: path.slice(7), observed: true, fields: [{ name: "sender", type: "addr", indexed: true }, { name: "amountRaw", type: "u256", indexed: true }] } });
    if (path === "query-assistant") {
      if (route.request().method() === "GET") return route.fulfill({ json: { configured, provider: "OpenRouter" } });
      translations.push(route.request().postDataJSON()); return route.fulfill({ json: preview });
    }
    if (path === "query") {
      const body = route.request().postDataJSON(); executed.push(body);
      return route.fulfill({ json: { dataset: datasets[0], entities: [], total: "0", coverage: { complete: true, throughBlock: "200", actualRows: 0, gaps: [] }, scope: { fromBlock: "100", toBlock: "200" }, executedQuery: preview.nativeQuery, blockNumber: "1", fetchedAt: "2026-11-07T00:00:00Z" } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(`/query?dataset=${key}`);
  return { executed, translations };
}
test("English generation requires review, executes through the existing query path and preserves manual editing", async ({ page }) => {
  const { executed, translations } = await setup(page);
  const mode = page.getByRole("group", { name: "Query input mode" });
  await expect(mode.getByRole("button", { name: "Manual query", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Sender address", { exact: true }).fill(owner);
  await mode.getByRole("button", { name: "Ask in English", exact: true }).click();
  await expect(page.getByLabel("Sender address", { exact: true })).toHaveCount(0);
  const prompt = page.getByLabel("Describe the records you want", { exact: true });
  await prompt.fill("Show transfers above 100 USDC, oldest first");
  await page.getByRole("button", { name: "Generate query", exact: true }).click();
  const review = page.getByRole("region", { name: "Generated query review" });
  await expect(review).toContainText("100.000001 USDC");
  await expect(review).toContainText("Oldest first");
  expect(executed).toHaveLength(0);
  expect(translations[0]).toEqual({ prompt: "Show transfers above 100 USDC, oldest first", datasetKeys: [key] });
  await review.getByText("Generated Arkiv query", { exact: true }).click();
  await expect(review.locator("pre")).toContainText("u256(100000001)");
  await mode.getByRole("button", { name: "Manual query", exact: true }).click();
  await expect(page.getByLabel("Sender address", { exact: true })).toHaveValue(owner);
  await mode.getByRole("button", { name: "Ask in English", exact: true }).click();
  await expect(prompt).toHaveValue("Show transfers above 100 USDC, oldest first");
  await page.getByRole("button", { name: "Generate query", exact: true }).click();
  await review.getByRole("button", { name: "Edit manually", exact: true }).click();
  await expect(page.getByLabel("Minimum transfer amount (base units)", { exact: true })).toHaveValue("100000001");
  await expect(page.getByLabel("Row order", { exact: true })).toHaveValue("asc");
  expect(executed).toHaveLength(0);
  await mode.getByRole("button", { name: "Ask in English", exact: true }).click();
  await page.getByRole("button", { name: "Generate query", exact: true }).click();
  await review.getByRole("button", { name: "Run query", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Query results · 0 matching transfers" })).toBeVisible();
  expect(executed).toHaveLength(1);
  expect(executed[0]).toMatchObject({ datasetKey: key, filters, mode: "page" });
  await page.getByLabel("Dataset name", { exact: true }).fill("English query results");
  await expect(page.getByRole("button", { name: "Save as dataset", exact: true })).toBeEnabled();
  await prompt.fill("A different question");
  await expect(review).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Query results ·/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save as dataset", exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await prompt.fill("Show transfers above 100 USDC, oldest first");
  await page.getByRole("button", { name: "Generate query", exact: true }).click();
  await expect(review).toBeVisible();
  await page.screenshot({ path: ".axis/english-query/review-desktop.png", fullPage: true });
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(review).toBeVisible();
    if (width === 390) await page.screenshot({ path: ".axis/english-query/review-mobile.png", fullPage: true });
  }
});
test("clarification and unavailable provider states keep manual querying accessible", async ({ page }) => {
  await setup(page, false);
  await page.getByRole("group", { name: "Query input mode" }).getByRole("button", { name: "Ask in English", exact: true }).click();
  await expect(page.getByText("English queries are not available yet.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate query", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Use Manual query", exact: true }).click();
  await expect(page.getByRole("button", { name: "Execute query", exact: true })).toBeEnabled();
  await page.route("**/api/axis/query-assistant", route => route.fulfill({ json: route.request().method() === "GET" ? { configured: true } : { status: "clarification", summary: "A wallet address is needed.", questions: ["Which sender address should be used?"], queries: [], generatedAt: "2026-11-07T00:00:00Z" } }));
  await page.getByRole("group", { name: "Query input mode" }).getByRole("button", { name: "Ask in English", exact: true }).click();
  await page.getByLabel("Describe the records you want").fill("Show my transfers");
  await page.getByRole("button", { name: "Generate query", exact: true }).click();
  await expect(page.getByText("Which sender address should be used?", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run query", exact: true })).toHaveCount(0);
});
test("late translations are discarded when the prompt or dataset changes", async ({ page }) => {
  const { executed } = await setup(page);
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  await page.route("**/api/axis/query-assistant", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { configured: true } });
    started = true; await held;
    await route.fulfill({ json: preview }).catch(() => {});
  });
  await page.getByRole("group", { name: "Query input mode" }).getByRole("button", { name: "Ask in English", exact: true }).click();
  const prompt = page.getByLabel("Describe the records you want");
  await prompt.fill("Show large transfers"); await page.getByRole("button", { name: "Generate query", exact: true }).click();
  await expect.poll(() => started).toBe(true);
  await prompt.fill("Show a different query");
  await page.getByLabel("Dataset", { exact: true }).selectOption(other);
  release();
  await expect(prompt).toHaveValue("Show a different query");
  await expect(page.getByRole("region", { name: "Generated query review" })).toHaveCount(0);
  expect(executed).toHaveLength(0);
});

test("a generated filter missing from the loaded schema cannot silently broaden the query", async ({ page }) => {
  const { executed } = await setup(page);
  await page.route("**/api/axis/query-assistant", route => route.fulfill({ json: route.request().method() === "GET" ? { configured: true } : { ...preview, queries: [{ datasetKey: key, filters: { order: "desc", conditions: [{ field: "txHash", operator: "=", value: other }] } }] } }));
  await page.getByRole("group", { name: "Query input mode" }).getByRole("button", { name: "Ask in English", exact: true }).click();
  await page.getByLabel("Describe the records you want").fill("Show transfers for this transaction");
  await page.getByRole("button", { name: "Generate query", exact: true }).click();
  await page.getByRole("button", { name: "Run query", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Dataset filters changed" })).toBeVisible();
  expect(executed).toHaveLength(0);
});

test("Execute query generates, runs, reveals its execution panel and renders returned records in one step", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await setup(page);
  let release = () => {}, reads = 0;
  let held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/axis/query", async route => {
    reads++; const round = reads;
    await held;
    const amount = round === 1 ? "175.25" : "280.5";
    await route.fulfill({ json: { dataset: datasets[0], entities: [{ sourceId: `result-${round}`, blockNumber: "150", txHash: other, logIndex: 0, sender: owner, recipient: "0x" + "b".repeat(40), amountRaw: round === 1 ? "175250000" : "280500000", amount }], total: "1", coverage: { complete: true, throughBlock: "200", actualRows: 1, gaps: [] }, scope: { fromBlock: "100", toBlock: "200" }, executedQuery: preview.nativeQuery, blockNumber: "1", fetchedAt: "2026-11-07T00:00:00Z" } });
  });
  await page.getByRole("group", { name: "Query input mode" }).getByRole("button", { name: "Ask in English", exact: true }).click();
  await page.getByLabel("Describe the records you want").fill("Show transfers above 100 USDC");
  await page.getByRole("button", { name: "Execute query", exact: true }).click();
  const execution = page.getByRole("region", { name: "Query execution and results", exact: true });
  await expect(execution.getByRole("status", { name: "Query execution status" })).toContainText("Running on Arkiv");
  await expect(execution.getByRole("heading", { name: "Run query", exact: true })).toBeInViewport();
  await expect(page.getByRole("region", { name: "Generated query review" })).toBeVisible();
  const table = execution.getByRole("table", { name: "Verified transfers", exact: true });
  await expect(table).toHaveCount(0);
  release();
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table).toContainText("175.25");
  await expect(execution.getByRole("status", { name: "Query execution status" })).toContainText("Completed");
  await expect(execution.getByLabel("Executed Arkiv query", { exact: true })).toContainText("u256(100000001)");
  await expect(table).toBeInViewport();
  // Measure both elements in the same frame while the result reveal is scrolling.
  const bounds = await page.evaluate(() => ({
    saveBottom: document.querySelector(".axis-query-library")!.getBoundingClientRect().bottom,
    resultsTop: document.querySelector('[aria-label="Query execution and results"]')!.getBoundingClientRect().top,
  }));
  expect(bounds.saveBottom).toBeLessThanOrEqual(bounds.resultsTop);
  expect(reads).toBe(1);
  held = new Promise<void>(resolve => { release = resolve; });
  await page.getByRole("button", { name: "Run query", exact: true }).click();
  await expect(execution.getByRole("status", { name: "Query execution status" })).toContainText("Running on Arkiv");
  await expect(table).toHaveCount(0);
  release();
  await expect(table).toContainText("280.5");
  await expect(table).not.toContainText("175.25");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(table).toBeVisible();
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await execution.scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".axis/english-query/execution-and-table.png" });
});
