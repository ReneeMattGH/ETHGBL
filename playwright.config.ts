import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./tests", timeout: 420000, expect: { timeout: 20000 }, workers: 1, retries: 0, reporter: "list", use: { baseURL: process.env.BASE_URL ?? "http://localhost:3100", channel: "chrome", headless: true, actionTimeout: 30000, trace: "retain-on-failure", screenshot: "only-on-failure" } });
