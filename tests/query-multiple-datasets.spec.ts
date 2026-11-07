import { expect, test } from "@playwright/test";
import { aggregateTransfers } from "../src/lib/axis/core";
import type { Transfer } from "../src/lib/axis/model";

const keyA = `0x${"1".repeat(64)}`, keyB = `0x${"2".repeat(64)}`, owner = `0x${"a".repeat(40)}`, recipient = `0x${"b".repeat(40)}`;
const datasets = [keyA, keyB].map((key, index) => ({ key, owner, creator: owner, writer: owner, name: index ? "Settlement records" : "Treasury transfers", description: "", chainId: 137, contract: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", startBlock: index ? "30" : "10", endBlock: "0", enabled: true, continuous: true, createdAt: "2026-11-07T00:00:00Z" }));
const fieldsA = [{ name: "sender", type: "addr", indexed: true }, { name: "amountRaw", type: "u256", indexed: true }];
const fieldsB = [{ name: "recipient", type: "addr", indexed: true }, { name: "txHash", type: "key", indexed: true }];
const rows: Transfer[] = Array.from({ length: 30 }, (_, index) => ({ datasetKey: index < 15 ? keyA : keyB, entityKey: "0x" + (index + 1).toString(16).padStart(64, "0"), sourceId: "row-" + index, chainId: 137, contract: datasets[0].contract, blockNumber: String(index + 10), blockHash: keyA, timestamp: "1794000000", txHash: keyA, txIndex: 0, logIndex: index, sender: owner, recipient, amountRaw: "1000000", amount: "1", decimals: 6, contentHash: keyA }));
const coverage = { complete: true, fromBlock: "10", throughBlock: "40", requestedThrough: "40", expectedRows: 30, actualRows: 30, gaps: [], manifests: [] };

test("multiple schemas render together and execute, page, export and build one combined query", async ({ page }) => {
  // API and wallet-free fixtures exercise the UI without sending transactions.
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/axis/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/api/axis/", "");
    if (path === "datasets") return route.fulfill({ json: { datasets } });
    if (path.startsWith("schema/")) return route.fulfill({ json: { datasetKey: path.slice(7), observed: true, fields: path.endsWith(keyA) ? fieldsA : fieldsB } });
    if (path === "query") {
      const body = route.request().postDataJSON(); requests.push(body);
      const sources = (body.queries ?? [{ datasetKey: body.datasetKey, filters: body.filters }]).map((source: { datasetKey: string; filters: unknown }) => ({ ...source, dataset: datasets.find(dataset => dataset.key === source.datasetKey), coverage }));
      return route.fulfill({ json: { dataset: sources[0].dataset, sources, recordDatasets: datasets.map(({ key, name }) => ({ key, name })), coverage, entities: body.mode === "export" ? rows : rows.slice(body.offset ?? 0, (body.offset ?? 0) + (body.limit ?? 25)), total: "30", analytics: body.mode === "page" ? undefined : aggregateTransfers(rows), scope: { fromBlock: "10", toBlock: "40", fromTime: null, toTime: null }, executedQuery: "(dataset A scope) OR (dataset B scope)", blockNumber: "100", fetchedAt: "2026-11-07T00:00:00Z" } });
    }
    return route.fulfill({ json: { queries: [], dashboards: [] } });
  });
  await page.goto("/query");
  await page.getByLabel("Dataset", { exact: true }).selectOption(keyA);
  await page.getByLabel("Sender address", { exact: true }).fill(owner);
  await page.getByLabel("Minimum transfer amount (base units)", { exact: true }).fill("1000000");
  await page.getByRole("button", { name: "Add dataset", exact: true }).click();
  const first = page.getByRole("group", { name: "Dataset 1 filters", exact: true });
  const second = page.getByRole("group", { name: "Dataset 2 filters", exact: true });
  await expect(second.getByLabel("Dataset", { exact: true }).locator(`option[value="${keyA}"]`)).toHaveCount(0);
  await second.getByLabel("Dataset", { exact: true }).selectOption(keyB);
  await expect(first.getByLabel("Sender address", { exact: true })).toHaveValue(owner);
  await expect(first.getByLabel("Recipient address", { exact: true })).toHaveCount(0);
  await expect(second.getByLabel("Sender address", { exact: true })).toHaveCount(0);
  await second.getByLabel("Recipient address", { exact: true }).fill(recipient);
  await second.getByLabel("Transaction hash", { exact: true }).fill(keyA);
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "Execute query", exact: true }).click();
  const table = page.getByRole("table", { name: "Verified transfers" });
  await expect(table).toHaveCount(1);
  await expect(table.locator("tbody tr")).toHaveCount(25);
  await expect(table.getByRole("columnheader", { name: "Source dataset", exact: true })).toBeVisible();
  expect(requests[0].queries).toEqual([
    { datasetKey: keyA, filters: { conditions: [{ field: "amountRaw", operator: ">=", value: "1000000" }], sender: owner, order: "desc" } },
    { datasetKey: keyB, filters: { conditions: [{ field: "txHash", operator: "=", value: keyA }], recipient, order: "desc" } },
  ]);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(table.locator("tbody tr")).toHaveCount(5);
  expect(requests.some(request => request.mode === "page" && request.offset === 25 && Array.isArray(request.queries))).toBe(true);
  await page.getByLabel("Page size", { exact: true }).selectOption("10");
  await expect(table.locator("tbody tr")).toHaveCount(10);

  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export full result CSV", exact: true }).click();
  const download = await downloadEvent, stream = await download.createReadStream();
  let csv = ""; for await (const chunk of stream!) csv += chunk.toString();
  expect(download.suggestedFilename()).toBe("axis-combined-results.csv");
  expect(csv.split("\r\n")).toHaveLength(31);
  expect(csv.split("\r\n")[0]).toContain("datasetKey");
  await page.getByLabel("Dataset name", { exact: true }).fill("Combined transfers");
  await expect(page.getByRole("button", { name: "Save as dataset", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Save as dataset", exact: true }).click();
  await expect(page.locator(".axis-query-main [role=alert]")).toContainText("Install an Ethereum browser wallet");
  const exports = requests.filter(request => request.mode === "export");
  expect(exports).toHaveLength(2);
  expect(exports[1].queries).toEqual(requests[0].queries);
  const dashboardHref = await page.getByRole("link", { name: "Build dashboard" }).getAttribute("href");
  expect(JSON.parse(new URL(dashboardHref!, "http://localhost").searchParams.get("queries")!)).toEqual(requests[0].queries);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Overflow at " + width).toBe(true);
    await expect(first.getByLabel("Sender address", { exact: true })).toBeVisible();
    await expect(second.getByLabel("Recipient address", { exact: true })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    if (width === 1440 || width === 390) await page.screenshot({ path: `.axis/query-multiple/combined-${width}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Remove dataset 2", exact: true }).click();
  await expect(page.getByLabel("Dataset", { exact: true })).toHaveCount(1);
  await expect(page.getByLabel("Sender address", { exact: true })).toHaveValue(owner);
  await expect(table).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save as dataset", exact: true })).toBeDisabled();

  await page.goto(dashboardHref!);
  await expect(page.getByRole("complementary", { name: "Data and filters" }).getByText("2 datasets", { exact: true })).toBeVisible();
  await expect(page.locator(".axis-report-grid > .axis-report-visual")).toHaveCount(8);
  await page.getByRole("button", { name: "Save local draft", exact: true }).click();
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem("axis:dashboard-draft:v1")!));
  expect(draft.widgets[0].query.queries).toEqual(requests[0].queries);
});

test("schema failures and late responses stay isolated when datasets are added or removed", async ({ page }) => {
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  let started = false, failB = true;
  let queryReads = 0;
  await page.route("**/api/axis/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/api/axis/", "");
    if (path === "datasets") return route.fulfill({ json: { datasets } });
    if (path === "schema/" + keyA) { started = true; await held; return route.fulfill({ json: { datasetKey: keyA, observed: true, fields: fieldsA } }); }
    if (path === "schema/" + keyB) return route.fulfill(failB ? { status: 503, json: { error: "Settlement schema unavailable" } } : { json: { datasetKey: keyB, observed: true, fields: fieldsB } });
    if (path === "query") { queryReads++; return route.fulfill({ status: 503, json: { error: "Query unavailable" } }); }
    return route.fulfill({ json: {} });
  });
  await page.goto("/query");
  await page.getByLabel("Dataset", { exact: true }).selectOption(keyA);
  await expect.poll(() => started).toBe(true);
  await page.getByRole("button", { name: "Add dataset", exact: true }).click();
  const second = page.getByRole("group", { name: "Dataset 2 filters", exact: true });
  await second.getByLabel("Dataset", { exact: true }).selectOption(keyB);
  await expect(second.getByRole("alert")).toContainText("Settlement schema unavailable");
  await expect(page.getByRole("button", { name: "Execute query", exact: true })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Build dashboard" })).toHaveAttribute("aria-disabled", "true");
  failB = false;
  await second.getByRole("button", { name: "Retry schema", exact: true }).click();
  await second.getByLabel("Recipient address", { exact: true }).fill(recipient);
  await expect(page.getByRole("button", { name: "Execute query", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Remove dataset 1", exact: true }).click();
  await expect(page.getByLabel("Recipient address", { exact: true })).toHaveValue(recipient);
  const completed = page.waitForResponse(response => response.url().endsWith("/schema/" + keyA));
  release(); await completed;
  await expect(page.getByLabel("Sender address", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Recipient address", { exact: true })).toHaveValue(recipient);
  await expect(page.getByRole("button", { name: "Execute query", exact: true })).toBeEnabled();
  expect(queryReads).toBe(0);
  await page.getByRole("button", { name: "Add dataset", exact: true }).click();
  await page.getByRole("group", { name: "Dataset 2 filters", exact: true }).getByLabel("Dataset", { exact: true }).selectOption(keyA);
  await expect(page.getByLabel("Sender address", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Recipient address", { exact: true })).toHaveValue(recipient);
  await page.getByLabel("Transaction hash", { exact: true }).fill("0x12");
  await page.getByRole("button", { name: "Execute query", exact: true }).click();
  await expect(page.locator(".axis-query-main [role=alert]")).toContainText("Settlement records: Invalid transaction hash");
  expect(queryReads).toBe(0);
});
