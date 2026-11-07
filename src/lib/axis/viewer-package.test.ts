import { expect, it } from "vitest";
import { dashboardViewerFiles } from "./viewer-package";

it("packages only the dashboard website and read routes without copying workspace pages or secrets", async () => {
  const files = await dashboardViewerFiles();
  expect(files["src/app/d/[id]/page.tsx"]).toContain("ReportWebsite");
  expect(files["src/app/api/reports/[id]/[...path]/route.ts"]).toContain("readReportData");
  expect(files["src/components/axis/report-website.tsx"]).toContain("/api/reports/");
  for (const path of Object.keys(files)) expect(path).not.toMatch(/(?:\.env|\.axis|shell\.tsx|wallet\.tsx|dashboard-builder\.tsx|swarm|ingestor|app\/query|app\/datasets|app\/overview)/);
  expect(Object.keys(JSON.parse(files["package.json"]).dependencies)).not.toContain("@duckdb/node-api");
  expect(files["src/app/api/reports/[id]/[...path]/route.ts"]).not.toMatch(/publishDashboard|workerWriter|enqueue/);
});
