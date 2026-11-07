import { expect, test } from "@playwright/test";

const key = "0x" + "1".repeat(64), owner = "0x" + "a".repeat(40), reference = "b".repeat(64);
const dataset = { key, name: "Treasury transfers", owner, creator: owner, writer: owner, chainId: 137, contract: owner, startBlock: "10", endBlock: "20", enabled: true, continuous: false };
const rows = Array.from({ length: 30 }, (_, i) => ({ sourceId: "row-" + i, datasetKey: key, chainId: 137, contract: owner, blockNumber: "15", blockHash: key, timestamp: "1794000000", txHash: key, txIndex: 0, logIndex: i, sender: owner, recipient: owner, amountRaw: "1000000", amount: "1", decimals: 6, contentHash: key }));
const result = { dataset, entities: rows, total: "30", coverage: { complete: true, throughBlock: "20", fromBlock: "10", expectedRows: 30, actualRows: 30, gaps: [], manifests: [] }, scope: { fromBlock: "10", toBlock: "20" }, executedQuery: "Verified query", blockNumber: "1", fetchedAt: "2026-11-07T00:00:00Z" };
const snapshotDocument = { version: 1, title: "Treasury snapshot", description: "Frozen result", publisher: owner, createdAt: "2026-11-07T00:00:00Z", swarmReference: reference, manifestSha256: "c".repeat(64), rowCount: 30, chainId: 137, fromBlock: "10", throughBlock: "20", sourceDatasetKeys: [key], postageBatchId: "d".repeat(64), batchBuyerAddress: owner, batchDonor: null, uploadService: "Fixture Bee" };
const receipt = { document: snapshotDocument, gatewayUrl: `https://api.gateway.ethswarm.org/bzz/${reference}/`, verifiedAt: "2026-11-07T00:01:00Z" };

test("public consent is required, declined Arkiv transactions reuse the verified upload", async ({ page }) => {
  // Controlled API responses and a wallet stub; this is UI proof, not a live Swarm upload.
  let uploads = 0;
  await page.addInitScript(({ owner }) => {
    let switches = Number(sessionStorage.getItem("fixture:swarm-switches") ?? "0");
    Object.assign(window, { ethereum: { request: async ({ method }: { method: string }) => {
      if (method === "eth_accounts") return [owner];
      if (method === "wallet_switchEthereumChain") { switches++; sessionStorage.setItem("fixture:swarm-switches", String(switches)); if (switches > 1) throw Object.assign(new Error("Declined"), { code: 4001 }); return null; }
      if (method === "personal_sign") return "0x" + "1".repeat(130);
      throw new Error("Unexpected wallet method: " + method);
    } } });
  }, { owner });
  await page.route("**/api/axis/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/api/axis/", "");
    if (path === "datasets") return route.fulfill({ json: { datasets: [dataset] } });
    if (path.startsWith("schema/")) return route.fulfill({ json: { datasetKey: key, observed: true, fields: [] } });
    if (path === "query") return route.fulfill({ json: result });
    if (path === "swarm/status") return route.fulfill({ json: { configured: true, missing: [], allowedUploaders: [owner], maxBytes: 20971520 } });
    if (path === "swarm/upload") { uploads++; expect(route.request().postDataJSON().intent.query.datasetKey).toBe(key); return route.fulfill({ json: receipt }); }
    if (path === "swarm/publication") return route.fulfill({ json: { verified: true, publication: null } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/query?dataset=" + key);
  await expect(page.getByRole("heading", { name: "Archive on Swarm" })).toHaveCount(0);
  await page.getByRole("button", { name: "Execute query", exact: true }).click();
  const publish = page.getByRole("button", { name: "Publish public snapshot", exact: true });
  await expect(publish).toBeDisabled();
  await page.getByLabel("Make these query results public on Swarm.").check();
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(page.locator(".axis-swarm-publisher [role=alert]")).toContainText("wallet request was declined");
  expect(uploads).toBe(1);
  await expect(page.getByRole("link", { name: "Open archived report on Swarm" })).toHaveAttribute("href", receipt.gatewayUrl);
  await page.getByRole("button", { name: "Publish reference to Arkiv", exact: true }).click();
  await expect(page.locator(".axis-swarm-publisher [role=alert]")).toContainText("wallet request was declined");
  expect(uploads).toBe(1);
  await page.reload();
  await page.getByRole("button", { name: "Execute query", exact: true }).click();
  await expect(page.getByRole("button", { name: "Publish reference to Arkiv", exact: true })).toBeVisible();
  await page.getByLabel("Make these query results public on Swarm.").check();
  await page.getByRole("button", { name: "Publish reference to Arkiv", exact: true }).click();
  await expect(page.locator(".axis-swarm-publisher [role=alert]")).toContainText("wallet request was declined");
  expect(uploads).toBe(1);
});

test("snapshot library opens Arkiv publications and reports read failures without fake rows", async ({ page }) => {
  let fail = false;
  await page.route("**/api/axis/swarm/snapshots**", route => {
    const url = new URL(route.request().url());
    if (fail) return route.fulfill({ status: 503, json: { error: "Arkiv unavailable" } });
    if (url.pathname.endsWith("/" + key)) return route.fulfill({ json: { ...receipt, entityKey: key, owner, expiresAt: "999999999", result } });
    return route.fulfill({ json: { snapshots: [{ ...receipt, entityKey: key, owner, expiresAt: "999999999" }], total: "1", offset: 0, limit: 25, invalidEntries: 0 } });
  });
  await page.goto("/snapshots");
  await expect(page.getByRole("table", { name: "Published Swarm snapshots" }).locator("tbody tr")).toHaveCount(1);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (width < 650) {
      const list = page.getByRole("list", { name: "Published Swarm snapshots", exact: true });
      await expect(list).toBeVisible(); await expect(list.getByText("30 rows", { exact: true })).toBeVisible(); await expect(list.getByText("10–20", { exact: true })).toBeVisible();
      const previous = await page.getByRole("button", { name: "Previous", exact: true }).boundingBox(), next = await page.getByRole("button", { name: "Next", exact: true }).boundingBox();
      expect(Math.abs(previous!.y - next!.y)).toBeLessThan(1);
    }
  }
  await page.getByRole("link", { name: "Treasury snapshot", exact: true }).click();
  await expect(page.getByText("Verified 30 archived rows against the manifest checksum on Arkiv.")).toBeVisible();
  await page.getByRole("link", { name: "All snapshots", exact: true }).click();
  await expect(page).toHaveURL(/\/snapshots$/);
  await expect(page.getByRole("heading", { name: "Swarm snapshots", exact: true })).toBeVisible();
  fail = true; await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Arkiv unavailable" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Arkiv unavailable" })).not.toContainText("Showing the last successful data");
  await expect(page.getByRole("table", { name: "Published Swarm snapshots" })).toHaveCount(0);
});

test("snapshot viewer pages frozen records, links Swarm downloads and hides failed verification", async ({ page }) => {
  let fail = false;
  await page.route("**/api/axis/swarm/snapshots/**", route => fail
    ? route.fulfill({ status: 400, json: { error: "Swarm manifest checksum does not match Arkiv." } })
    : route.fulfill({ json: { ...receipt, entityKey: key, owner, expiresAt: "999999999", result } }));
  await page.goto("/snapshots/" + key);
  await expect(page.getByRole("heading", { name: "Treasury snapshot", exact: true })).toBeVisible();
  await expect(page.getByText("Verified 30 archived rows against the manifest checksum on Arkiv.")).toBeVisible();
  const table = page.getByRole("table", { name: "Verified transfers" });
  await expect(table.locator("tbody tr")).toHaveCount(25);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(table.locator("tbody tr")).toHaveCount(5);
  await expect(page.getByRole("link", { name: "CSV", exact: true })).toHaveAttribute("href", receipt.gatewayUrl + "results.csv");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `.axis/screenshots/swarm-snapshot-${width}.png`, fullPage: true });
  }
  fail = true; await page.getByRole("button", { name: "Verify snapshot again", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "checksum" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "checksum" })).not.toContainText("Showing the last successful data");
  await expect(table).toHaveCount(0);
});

test("missing Swarm configuration keeps publishing disabled", async ({ page }) => {
  await page.route("**/api/axis/**", route => {
    const path = new URL(route.request().url()).pathname.replace("/api/axis/", "");
    const json = path === "datasets" ? { datasets: [dataset] } : path.startsWith("schema/") ? { datasetKey: key, observed: true, fields: [] } : path === "query" ? result : { configured: false, missing: ["SWARM_BEE_URL", "SWARM_POSTAGE_BATCH_ID"], allowedUploaders: [owner] };
    return route.fulfill({ json });
  });
  await page.goto("/query?dataset=" + key);
  await page.getByRole("button", { name: "Execute query", exact: true }).click();
  await page.getByLabel("Make these query results public on Swarm.").check();
  await expect(page.getByRole("button", { name: "Publish public snapshot", exact: true })).toBeDisabled();
  await expect(page.getByText(/Swarm uploads need server configuration:/)).toContainText("SWARM_POSTAGE_BATCH_ID");
});
