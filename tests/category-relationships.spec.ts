import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { relationshipChart } from "../src/lib/axis/catalog-insights";

const rows = [
  ...Array.from({ length: 8 }, () => ({ protocol: "Aave v3", role: "Lending pool" })),
  ...Array.from({ length: 4 }, () => ({ protocol: "QuickSwap", role: "Trading pool" })),
  ...Array.from({ length: 2 }, () => ({ protocol: "QuickSwap", role: "Router" })),
  { protocol: "Uniswap v3", role: "Trading pool" },
  { protocol: "Uniswap v3", role: "Router" },
];

test("relationship flows and matrices retain intersections, filters, exact exports and keyboard access", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/axis/**", async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace("/api/axis/", "");
    const json = path === "bulk/imports" ? { imports: [] } : path === "catalog/insights" ? {
      entryId: "address-labels", status: "available", metrics: [{ label: "Label records", value: String(rows.length) }],
      charts: [relationshipChart("Protocol role flow", "Labels", rows, "protocol", "role", { source: "Protocol", target: "Contract role" }), relationshipChart("Protocol role matrix", "Labels", rows, "protocol", "role", { source: "Protocol", target: "Contract role" }, "matrix")],
    } : {};
    await route.fulfill({ json });
  });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/explore?view=curated&item=address-labels");
  const flow = page.getByRole("region", { name: "Protocol role flow", exact: true }), matrix = page.getByRole("region", { name: "Protocol role matrix", exact: true });
  await expect(flow.locator(".axis-flow path[role=button]")).toHaveCount(5);
  await expect(matrix.locator(".axis-category-matrix g[role=button]")).toHaveCount(9);
  await flow.getByRole("button", { name: /Aave v3 to Lending pool:/ }).focus();
  await expect(flow.locator(".axis-plot-tip")).toContainText("50.00%");
  await matrix.getByRole("button", { name: /QuickSwap, Router:/ }).focus();
  await expect(matrix.locator(".axis-plot-tip")).toContainText("QuickSwap → Router");
  const legend = flow.getByRole("group", { name: "Chart legend" });
  await legend.getByRole("button", { name: "Lending pool", exact: true }).click();
  await expect(flow.locator(".axis-chart-primary strong")).toHaveText("8");
  await expect(flow.locator(".axis-flow path[role=button]")).toHaveCount(4);
  await flow.getByRole("button", { name: "Data", exact: true }).click();
  await expect(flow.getByRole("table", { name: "Exact chart values" })).toContainText("Aave v3");
  await flow.getByRole("button", { name: "Chart", exact: true }).click();
  await legend.getByRole("button", { name: "All", exact: true }).click();
  const menu = flow.locator(".axis-chart-export"); await menu.locator("summary").click();
  for (const format of ["CSV", "SVG", "PNG"]) {
    const downloaded = page.waitForEvent("download");
    await menu.getByRole("button", { name: format === "CSV" ? "Download chart CSV" : `Download ${format}`, exact: true }).click();
    const file = await downloaded, bytes = readFileSync((await file.path())!);
    expect(bytes.length).toBeGreaterThan(format === "CSV" ? 100 : 1000);
    if (format === "SVG") expect(bytes.toString()).toContain("Lending pool");
  }
  await page.screenshot({ path: ".axis/analytical-redesign/relationship-1600.png", fullPage: true });
  for (const width of [1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(flow.locator(".axis-flow")).toBeVisible();
    if (width <= 390) {
      await expect(flow.locator(".axis-flow")).toHaveClass(/axis-flow-vertical/);
      await expect.poll(() => flow.locator(".axis-flow").evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    }
  }
  await page.screenshot({ path: ".axis/analytical-redesign/relationship-320.png", fullPage: true });
  expect(errors).toEqual([]);
});
