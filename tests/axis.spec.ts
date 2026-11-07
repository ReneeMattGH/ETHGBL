import { test, expect } from "@playwright/test";
import nextEnv from "@next/env";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseEnv } from "node:util";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, createPublicClient, ENTITY_EVENTS_ABI } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { decodeEventLog, http, type Hex, type Address } from "viem";
nextEnv.loadEnvConfig(process.cwd());
type Evidence = { datasetKey: string; fromBlock: string; toBlock: string; transfers: number; amount: string; owner: string };
const evidence = () => JSON.parse(readFileSync(".axis/live-evidence.json", "utf8")) as Evidence;
const baseURL = process.env.BASE_URL ?? "http://localhost:3100";
test("public catalogs and real-data queries work without seeded dashboards", async ({ browser }) => {
  const data = evidence(), context = await browser.newContext({ baseURL });
  await context.addInitScript(() => localStorage.setItem("arkiv-viz-theme", "dark"));
  const page = await context.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/dashboards");
  await expect(page.getByRole("heading", { name: "Dashboards", exact: true })).toBeVisible();
  const catalog = await (await page.request.get("/api/axis/dashboards")).json();
  await expect(page.locator(".axis-dataset-card")).toHaveCount(catalog.dashboards.length);
  if (!catalog.dashboards.length) await expect(page.locator(".axis-empty")).toContainText("No dashboards yet.");
  await expect(page.getByRole("link", { name: "Prebuilt USDC analytics" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(false);
  await page.getByRole("link", { name: "Query Studio", exact: true }).click();
  await page.getByLabel("Dataset", { exact: true }).selectOption(data.datasetKey);
  const pageResult = page.waitForResponse(response => response.url().endsWith("/api/axis/query") && response.request().postDataJSON()?.mode === "page" && response.ok());
  await page.getByRole("button", { name: "Execute query", exact: true }).click();
  const fullDataset = await (await pageResult).json();
  expect(Number(fullDataset.total)).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: `Query results · ${fullDataset.total} matching transfers` })).toBeVisible({ timeout: 60000 });
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Export full result CSV" }).click();
  expect((await download).suggestedFilename()).toBe("axis-usdc-transfers.csv");
  console.log("Full-scope CSV export downloaded.");
  await page.getByLabel("Additional Arkiv predicate").fill("amountRaw > u256(99999999999999999999999999999999999)");
  await page.getByRole("button", { name: "Execute query", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Query results · 0 matching transfers" })).toBeVisible({ timeout: 60000 });
  await page.getByLabel("Additional Arkiv predicate").fill("not a valid predicate"); await page.getByRole("button", { name: "Execute query", exact: true }).click();
  await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 60000 });
  await page.goto("/settings"); await expect(page.getByRole("heading", { name: "Settings & connections" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Data Explorer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Data Explorer", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  mkdirSync(".axis/screenshots", { recursive: true }); await page.screenshot({ path: ".axis/screenshots/mobile-functional.png", fullPage: true });
  expect(errors).toEqual([]); await context.close();
});
test("wallet UI creates and imports a dataset, saves a query, and publishes independent dashboard widgets", async ({ browser }) => {
  test.skip(process.env.AXIS_ALLOW_TEST_WRITES !== "1", "Live publishing tests require explicit opt-in; normal checks do not populate public catalogs.");
  const data = evidence(), privateKey = parseEnv(readFileSync(".env.browser-test.local", "utf8")).AXIS_TEST_PRIVATE_KEY as Hex;
  const account = privateKeyToAccount(privateKey), chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" });
  let endpoint: string = chain.rpcUrls.default.http[0];
  if (process.env.ARKIV_RPC_URL?.trim()) { const url = new URL(process.env.ARKIV_RPC_URL.trim()); url.pathname = url.pathname.replace(/\/+$/, "") + "/" + encodeURIComponent(process.env.ARKIV_ACCESS_KEY ?? ""); endpoint = url.toString(); }
  const wallet = createWalletClient({ account, chain, transport: http(endpoint, { timeout: 30000, retryCount: 0 }) });
  const reader = createPublicClient({ chain, transport: http(endpoint, { timeout: 30000, retryCount: 0 }) });
  const submitted: Hex[] = [];
  const context = await browser.newContext({ baseURL });
  // Real local test signer. No private key is exposed to the page; RPC writes are mined on Rabdi.
  await context.exposeFunction("axisWalletRequest", async (input: { method: string; params?: unknown[] }) => {
    if (["eth_requestAccounts", "eth_accounts"].includes(input.method)) return [account.address];
    if (input.method === "eth_chainId") return "0x76edaf";
    if (["wallet_switchEthereumChain", "wallet_addEthereumChain"].includes(input.method)) return null;
    if (input.method === "personal_sign") return wallet.signMessage({ message: { raw: input.params![0] as Hex } });
    if (input.method === "eth_sendTransaction") {
      const transaction = input.params![0] as Record<string, string>;
      const hash = await wallet.sendTransaction({ to: transaction.to as Address, data: transaction.data as Hex, value: BigInt(transaction.value ?? "0"), ...(transaction.gas ? { gas: BigInt(transaction.gas) } : {}) });
      submitted.push(hash); return hash;
    }
    throw new Error(`Unsupported browser signer method: ${input.method}`);
  });
  await context.addInitScript(() => {
    window.ethereum = { request: input => (window as unknown as { axisWalletRequest: (input: unknown) => Promise<unknown> }).axisWalletRequest(input), on: () => {}, removeListener: () => {} };
  });
  const page = await context.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  let anonymous: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
  await page.goto("/datasets/new");
  await page.getByLabel("Dataset name", { exact: true }).fill("Browser-created USDC dataset");
  await page.getByLabel("Description", { exact: true }).fill("Created, signed and imported through the actual local AXIS interface.");
  await page.getByRole("button", { name: "Publish dataset definition", exact: true }).click();
  await page.waitForURL(/\/datasets\/0x[0-9a-fA-F]{64}$/, { timeout: 60000 });
  const datasetKey = page.url().split("/").at(-1)!;
  console.log("Browser wallet published a real dataset definition.");
  await page.getByRole("button", { name: "Run incremental import" }).click();
  await expect(page.getByText(/Import queued\.|All available dataset data is already verified\./)).toBeVisible({ timeout: 60000 });
  await expect(async () => {
    const response = await page.request.get(`/api/axis/datasets/${datasetKey}`); const body = await response.json(); expect(body.coverage?.complete).toBe(true);
  }).toPass({ timeout: 180000, intervals: [5000] });
  console.log("Browser-requested ingestion verified in Arkiv.");
  await page.goto(`/query?dataset=${datasetKey}`); await page.getByRole("button", { name: "Execute query", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible({ timeout: 60000 });
  await page.getByLabel("Query title", { exact: true }).fill("Browser signed query");
  await page.getByRole("button", { name: "Save query to Arkiv" }).click();
  await expect(page.getByText("Query saved to your wallet-owned Arkiv entity.")).toBeVisible({ timeout: 60000 });
  console.log("Browser wallet published a saved query.");
  await page.goto(`/dashboards/new?dataset=${datasetKey}`);
  await page.getByLabel("Dashboard title", { exact: true }).fill("Browser published AXIS dashboard");
  await page.getByLabel("Widget title", { exact: true }).fill("Browser dataset transfers");
  await page.getByRole("button", { name: "Verify & add widget" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard layout · 1 widgets" })).toBeVisible({ timeout: 60000 });
  await page.getByLabel("Dataset", { exact: true }).selectOption(data.datasetKey);
  await page.getByText("Query filters for this widget", { exact: true }).click();
  await page.getByLabel("Widget title", { exact: true }).fill("Separate dataset USDC total");
  await page.getByLabel("Measure", { exact: true }).selectOption("amount");
  const widgetResult = page.waitForResponse(response => response.url().endsWith("/api/axis/query") && response.request().postDataJSON()?.datasetKey === data.datasetKey && response.request().postDataJSON()?.mode === "analytics" && response.ok());
  await page.getByRole("button", { name: "Verify & add widget" }).click();
  const verifiedAmount = (await (await widgetResult).json()).analytics.amount;
  await expect(page.getByRole("heading", { name: "Dashboard layout · 2 widgets" })).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "Publish dashboard to Arkiv" }).click();
  await page.waitForURL(/\/dashboards\/0x[0-9a-fA-F]{64}$/, { timeout: 90000 });
  const dashboardKey = page.url().split("/").at(-1)!;
  console.log("Browser wallet published the multi-query dashboard.");
  await expect(page.getByRole("heading", { name: "Separate dataset USDC total" })).toBeVisible();
  anonymous = await browser.newContext({ baseURL }); const independent = await anonymous.newPage();
  await independent.goto(`/dashboards/${dashboardKey}`);
  await expect(independent.getByRole("heading", { name: "Browser published AXIS dashboard" })).toBeVisible();
  await expect(independent.getByText(verifiedAmount, { exact: true })).toBeVisible({ timeout: 60000 });
  const published = await (await page.request.get(`/api/axis/dashboards/${dashboardKey}`)).json();
  expect(published.dashboard.owner).toBe(account.address.toLowerCase());
  expect(published.dashboard.document.widgets[0].query.datasetKey).toBe(datasetKey);
  expect(published.dashboard.document.widgets[1].query.datasetKey).toBe(data.datasetKey);
  writeFileSync(".axis/pipeline-browser-evidence.json", JSON.stringify({ datasetKey, dashboardKey, owner: account.address, independentBrowser: true, at: new Date().toISOString() }, null, 2));
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: ".axis/screenshots/desktop-functional.png", fullPage: true });
  expect(errors).toEqual([]);
  } finally {
    await anonymous?.close(); await context.close();
    const created = new Set<Hex>();
    for (const hash of submitted) {
      const receipt = await reader.waitForTransactionReceipt({ hash, timeout: 30000 });
      for (const log of receipt.logs) {
        try {
          const event = decodeEventLog({ abi: ENTITY_EVENTS_ABI, eventName: "EntityCreated", data: log.data, topics: log.topics });
          if (event.args.owner.toLowerCase() === account.address.toLowerCase()) created.add(event.args.entityKey);
        } catch { /* Other receipt logs do not create test entities. */ }
      }
    }
    for (const entityKey of [...created].reverse()) await wallet.deleteEntity({ entityKey });
    for (const path of ["datasets", "dashboards", `queries?owner=${account.address}`]) {
      const response = await fetch(baseURL + "/api/axis/" + path); const payload = await response.json();
      const records = payload.datasets ?? payload.dashboards ?? payload.queries;
      expect(response.ok && records.every((item: { key: string }) => !created.has(item.key as Hex))).toBe(true);
    }
    console.log(`Cleaned up ${created.size} wallet-owned live test definitions.`);
  }
});
