import { expect, test } from "@playwright/test";

const owner = "0x" + "a".repeat(40);

test("mobile navigation keeps focus inside and restores scrolling on close or desktop resize", async ({ page }) => {
  // Controlled responses validate navigation behavior without provider calls or wallet writes.
  await page.route("**/api/axis/**", route => route.fulfill({ json: { writer: owner, finalizedBlock: "100", polygonConfigured: true, arkivConfigured: true, worker: { running: true }, configured: true } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");
  const menu = page.getByRole("button", { name: "Open navigation", exact: true });
  await menu.click();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  await expect(page.getByRole("link", { name: "AXIS Arkiv analytics", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Settings", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  const box = await menu.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
  await menu.click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await expect(page.locator(".axis-mobile-menu")).toHaveAttribute("aria-expanded", "false");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("navigation", { name: "Primary" })).not.toBeVisible();
});

test("settings distinguishes configuration from connectivity and clears failed status values", async ({ page }) => {
  let failed = false;
  await page.route("**/api/axis/**", route => {
    if (failed) return route.fulfill({ status: 503, json: { error: "Connection status unavailable" } });
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path.endsWith("/swarm/status") ? { configured: true } : { writer: owner, finalizedBlock: "100", polygonConfigured: true, arkivConfigured: true, worker: { running: true }, error: null } });
  });
  await page.goto("/settings");
  const connections = page.locator(".axis-settings-grid > .axis-panel");
  await expect(connections.getByText("Configured", { exact: true })).toHaveCount(3);
  await expect(connections.getByText("Connected", { exact: true })).toHaveCount(0);
  await expect(connections.getByText("Swarm uploads", { exact: true })).toBeVisible();
  failed = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Connection status unavailable" }).first()).toBeVisible();
  await expect(connections.getByText("Configured", { exact: true })).toHaveCount(0);
  await expect(connections.getByText("Unavailable", { exact: true })).toHaveCount(4);
  await expect(connections.getByText(owner, { exact: true })).toHaveCount(0);
  for (const width of [1440, 390, 320]) { await page.setViewportSize({ width, height: 1000 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }
});
