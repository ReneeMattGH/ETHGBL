import { test, expect } from "@playwright/test";
import { aggregateTransfers } from "../src/lib/axis/core";
import type { Transfer } from "../src/lib/axis/model";

const datasetKey = "0x" + "1".repeat(64), owner = "0x" + "2".repeat(40);
const dataset = { key: datasetKey, owner, creator: owner, writer: owner, expiresAt: "999999999", name: "Polygon USDC", description: "Verified transfers", contract: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", chainId: 137, enabled: true, continuous: true, startBlock: "10", endBlock: "0", createdAt: "2026-11-07T00:00:00Z" };
const rows: Transfer[] = ["10", "100"].map((blockNumber, index) => ({ sourceId: `source-${index}`, chainId: 137, contract: dataset.contract, blockNumber, blockHash: datasetKey, timestamp: String(1794000000 + index * 3600), txHash: datasetKey, txIndex: 0, logIndex: index, sender: owner, recipient: owner, amountRaw: "1000000", amount: "1", decimals: 6, contentHash: datasetKey }));
const coverage = { complete: true, fromBlock: "10", throughBlock: "100", requestedThrough: "100", expectedRows: 2, actualRows: 2, gaps: [], manifests: [{ key: datasetKey, fromBlock: "10", toBlock: "100", rows: 2, verifiedAt: "2026-11-07T00:00:00Z", transactionHashes: [datasetKey] }] };

test("internal pages use verified USDC data without block-range controls or hidden windows", async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  // Controlled API responses verify UI behavior; this test does not publish or import live records.
  await page.route("**/api/axis/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/api/axis/", "");
    let json: unknown;
    if (path === "config") json = { writer: owner, finalizedBlock: "100", worker: { running: true }, polygonConfigured: true, arkivConfigured: true };
    else if (path === "datasets") json = { datasets: [dataset] };
    else if (path.startsWith("datasets/")) json = { dataset, coverage };
    else if (path.startsWith("schema/")) json = { datasetKey, observed: true, fields: [] };
    else if (path === "ingestion/counts") json = { rows: "2", blocks: "2", tables: [{ id: "usdc", name: "USDC transfers", rows: "2" }], fetchedAt: "2026-11-07T00:00:00Z" };
    else if (path === "catalog/insights") json = { entryId: "token-transfers", status: "available", metrics: [], charts: [{ title: "Token transfer activity", unit: "Transfers", decimals: 0, kind: "stacked-area", points: [{ label: "Block 10", value: "1" }, { label: "Block 100", value: "1" }] }] };
    else if (path === "bulk/jobs") json = { jobs: [] };
    else if (path === "bulk/imports") json = { imports: [] };
    else if (path === "catalog/source") json = { dataset };
    else if (path === "query") {
      const body = route.request().postDataJSON(); requests.push(body);
      json = { dataset, coverage, scope: { fromBlock: "10", toBlock: "100", fromTime: null, toTime: null }, entities: rows, total: "2", analytics: aggregateTransfers(rows), scannedRows: 2, executedQuery: "Verified dataset query", blockNumber: "100", fetchedAt: "2026-11-07T00:00:00Z" };
    } else if (path === "ingestion") json = { worker: { running: true }, jobs: [{ id: "import-job", datasetKey, owner, fromBlock: "10", toBlock: "100", stage: "complete", processed: 2, total: 2, duplicates: 0, txHashes: [], createdAt: "2026-11-07T00:00:00Z", updatedAt: "2026-11-07T00:00:00Z" }] };
    else json = { dashboards: [], queries: [] };
    await route.fulfill({ json });
  });
  const noBlockControls = async () => {
    for (const label of ["Start block", "End block", "From block", "To block", "Rolling window (verified blocks)", "Continuously import finalized blocks"]) await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
  };
  await page.goto("/datasets/new");
  await expect(page.getByRole("button", { name: "Publish dataset definition" })).toBeEnabled();
  await expect(page.getByText("Continuous import", { exact: true })).toHaveCount(0);
  await noBlockControls();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: ".axis/screenshots/dataset-without-ranges.png", fullPage: true });

  await page.goto(`/query?dataset=${datasetKey}`);
  await noBlockControls();
  await page.getByRole("button", { name: "Execute query", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Query results · 2 matching transfers", exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: "Verified transfers" }).locator("tbody tr")).toHaveCount(2);
  await page.getByRole("link", { name: "Build dashboard" }).click();
  const chart = page.locator(".axis-insight-chart > .axis-analytics");
  await expect(chart.getByLabel("Chart range start", { exact: true })).toHaveCount(0);
  await expect(chart.getByLabel("Chart range end", { exact: true })).toHaveCount(0);
  await expect(chart.getByRole("button", { name: "Zoom in chart", exact: true })).toHaveCount(0);
  await chart.getByRole("button", { name: "Data", exact: true }).click();
  await expect(chart.getByRole("table", { name: "Exact chart values" }).locator("tbody tr")).toHaveCount(2);

  const legacyFilters = { fromBlock: "50", toBlock: "60", lookbackBlocks: "30" };
  await page.goto(`/dashboards/new?${new URLSearchParams({ dataset: datasetKey, filters: JSON.stringify(legacyFilters) })}`);

  await noBlockControls();

  await expect(page.locator(".axis-report-grid > .axis-report-visual")).toHaveCount(8);
  await page.getByRole("button", { name: "Save local draft" }).click();
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem("axis:dashboard-draft:v1")!));
  expect(draft.widgets[0].query.filters).toEqual({ order: "desc" });

  await page.goto(`/datasets/${datasetKey}`);
  await expect(page.getByRole("heading", { name: "Polygon USDC", exact: true })).toBeVisible();
  await expect(page.getByText("Requested blocks", { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Coverage", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "Import batch" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Batch 1", exact: true })).toBeVisible();
  await page.goto("/ingestion");
  await expect(page.getByRole("table", { name: "Arkiv stored data" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Source blocks" })).toHaveCount(0);
  await page.goto("/explore");
  await expect(page.getByRole("heading", { name: "Token transfer activity", exact: true })).toBeVisible();
  expect(requests.length).toBeGreaterThan(3);
  for (const request of requests) for (const field of ["fromBlock", "toBlock", "lookbackBlocks"]) expect(request.filters).not.toHaveProperty(field);
});
