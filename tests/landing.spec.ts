import { test, expect } from "@playwright/test";
import type { QueryResult } from "../src/components/axis/shared";

test("landing shows real Arkiv analytics and keeps the workspace accessible", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && /instant|module factory|hydration/i.test(message.text())) errors.push(message.text()); });
  const queryResponse = page.waitForResponse(response => response.url().endsWith("/api/axis/query") && response.request().postDataJSON()?.filters?.lookbackBlocks === "30");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /AXIS.*Arkiv eXploration.*and Intelligence.*System/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary", exact: true })).toHaveCount(0);
  const response = await queryResponse;
  expect(response.ok()).toBe(true);
  const result = await response.json() as QueryResult;
  const [whole, fraction] = result.analytics!.amount.split(".");
  const expectedAmount = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction ? `.${fraction}` : "");
  await expect(page.getByTestId("landing-live-value")).toHaveText(result.analytics!.transfers.toLocaleString("en-US"));
  await page.getByRole("button", { name: "Volume", exact: true }).click();
  await expect(page.getByTestId("landing-live-value")).toHaveText(expectedAmount);
  await page.getByRole("button", { name: "Transfers", exact: true }).click();
  await expect(page.getByRole("img", { name: "Verified transfer count by source block" })).toBeVisible();
  await page.getByRole("tab", { name: /Ask a question/ }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Follow your curiosity, precisely.");
  await page.getByRole("tab", { name: /Ask a question/ }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Share the answer/ })).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText("Make the insight everyone's.");
  await page.getByText("Is Query Studio SQL?", { exact: true }).click();
  await expect(page.getByText(/it does not execute arbitrary SQL/)).toBeVisible();
  await page.getByRole("link", { name: "Open workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("heading", { name: "Axis analytics workspace", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: /AXIS.*Arkiv analytics/ }).click();
  await expect(page.getByRole("heading", { name: /AXIS.*Arkiv eXploration.*and Intelligence.*System/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("landing navigation, reading order and layout work on narrow screens", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator("h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  const mobileNav = page.getByRole("navigation", { name: "Mobile landing navigation" });
  await expect(mobileNav).toBeVisible();
  await mobileNav.getByRole("link", { name: "How it works" }).focus();
  await page.keyboard.press("Escape");
  await expect(mobileNav).toBeHidden();
  await expect(page.getByRole("button", { name: "Open menu", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await mobileNav.getByRole("link", { name: "Questions?", exact: true }).click();
  await expect(mobileNav).toBeHidden();
  await page.getByText("Do I need a wallet to use it?", { exact: true }).click();
  await expect(page.getByText(/without connecting a wallet/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(false);
});

test("an unavailable live preview never substitutes invented metrics", async ({ page }) => {
  await page.route("**/api/axis/datasets", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Controlled outage for UI validation" }) }));
  await page.goto("/");
  await expect(page.getByRole("alert").filter({ hasText: "The live preview is temporarily unavailable." })).toBeVisible();
  await expect(page.getByTestId("landing-live-value")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Explore datasets", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open workspace", exact: true })).toBeVisible();
});
