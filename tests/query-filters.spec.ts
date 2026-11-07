import { expect, test } from "@playwright/test";

const keyA = "0x" + "1".repeat(64), keyB = "0x" + "2".repeat(64), owner = "0x" + "a".repeat(40);
const datasets = [keyA, keyB].map((key, index) => ({ key, owner, writer: owner, name: `Dataset ${index + 1}`, description: "", chainId: 137, contract: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", enabled: true, createdAt: "2026-11-07T00:00:00Z" }));
const schemaA = { datasetKey: keyA, observed: true, fields: [{ name: "sender", type: "addr", indexed: true }, { name: "sourceTime", type: "u64", indexed: true }, { name: "amountRaw", type: "u256", indexed: true }, { name: "blockNumber", type: "u64", indexed: true }, { name: "amount", type: "str", indexed: false }] };
const schemaB = { datasetKey: keyB, observed: true, fields: [{ name: "recipient", type: "addr", indexed: true }, { name: "txHash", type: "key", indexed: true }] };

test("filters follow the selected schema and reset query state when switching datasets", async ({ page }) => {
  const requests: { datasetKey: string; filters: Record<string, unknown> }[] = [];
  await page.route("**/api/axis/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/api/axis/", "");
    let json: unknown = {};
    if (path === "datasets") json = { datasets };
    else if (path.startsWith("schema/")) json = path.endsWith(keyA) ? schemaA : schemaB;
    else if (path === "query") {
      const body = route.request().postDataJSON(); requests.push(body);
      json = { dataset: datasets.find(dataset => dataset.key === body.datasetKey), entities: [], total: "0", coverage: { complete: true, actualRows: 0, gaps: [] }, scope: {}, executedQuery: "Verified query", blockNumber: "1", fetchedAt: "2026-11-07T00:00:00Z" };
    }
    await route.fulfill({ json });
  });
  await page.goto("/query");
  await expect(page.getByLabel("Sender address", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Execute query", exact: true })).toBeDisabled();
  await page.getByLabel("Dataset", { exact: true }).selectOption(keyA);
  await expect(page.getByLabel("Sender address", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Recipient address", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("From block", { exact: true })).toHaveCount(0);
  await page.getByLabel("Sender address", { exact: true }).fill(owner);
  await page.getByLabel("Minimum transfer amount (base units)", { exact: true }).fill("9007199254740993123");
  await page.getByRole("button", { name: "Execute query", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Query results · 0 matching transfers" })).toBeVisible();
  expect(requests[0].filters).toMatchObject({ sender: owner, conditions: [{ field: "amountRaw", operator: ">=", value: "9007199254740993123" }] });
  await page.getByLabel("Dataset", { exact: true }).selectOption(keyB);
  await expect(page.getByLabel("Transaction hash", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Sender address", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("From timestamp (Unix seconds)", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Query results/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export full result CSV" })).toBeDisabled();
  await expect(page.getByLabel("Recipient address", { exact: true })).toHaveValue("");
  await page.getByLabel("Transaction hash", { exact: true }).fill("0x12");
  const previous = requests.length;
  await page.getByRole("button", { name: "Execute query", exact: true }).click();
  await expect(page.locator(".axis-query-main [role=alert]")).toContainText("Invalid transaction hash");
  expect(requests.length).toBe(previous);
  await page.getByLabel("Transaction hash", { exact: true }).fill("0x" + "b".repeat(64));
  await page.getByRole("button", { name: "Execute query", exact: true }).click();
  await expect.poll(() => requests.filter(request => request.datasetKey === keyB).length).toBe(1);
  for (const request of requests.filter(request => request.datasetKey === keyB)) expect(request.filters).not.toHaveProperty("sender");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});

test("a delayed schema response cannot replace the current dataset's fields", async ({ page }) => {
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  await page.route("**/api/axis/datasets", route => route.fulfill({ json: { datasets } }));
  await page.route("**/api/axis/schema/**", async route => {
    if (route.request().url().endsWith(keyA)) { started = true; await held; await route.fulfill({ json: schemaA }); }
    else await route.fulfill({ json: schemaB });
  });
  await page.goto("/query");
  await page.getByLabel("Dataset", { exact: true }).selectOption(keyA);
  await expect.poll(() => started).toBe(true);
  await expect(page.getByRole("button", { name: "Execute query", exact: true })).toBeDisabled();
  await page.getByLabel("Dataset", { exact: true }).selectOption(keyB);
  await expect(page.getByLabel("Transaction hash", { exact: true })).toBeVisible();
  const completed = page.waitForResponse(response => response.url().endsWith(`/schema/${keyA}`));
  release(); await completed;
  await expect(page.getByLabel("Transaction hash", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Sender address", { exact: true })).toHaveCount(0);
});

test("schema failures allow retry and do not expose fixed transfer filters", async ({ page }) => {
  let fail = true;
  await page.route("**/api/axis/datasets", route => route.fulfill({ json: { datasets } }));
  await page.route("**/api/axis/schema/**", route => route.fulfill(fail ? { status: 503, json: { error: "Schema unavailable" } } : { json: schemaB }));
  await page.goto(`/query?dataset=${keyB}`);
  await expect(page.getByRole("group", { name: "Dataset 1 filters", exact: true }).getByRole("alert")).toContainText("Schema unavailable");
  await expect(page.getByRole("button", { name: "Execute query", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Sender address", { exact: true })).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Retry schema" }).click();
  await expect(page.getByLabel("Transaction hash", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Execute query", exact: true })).toBeEnabled();
});
