import { defineConfig, devices } from "@playwright/test";

const sitePort = 4180;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /homepage\.spec\.ts/,
  timeout: 30_000,
  workers: process.env.CI ? 1 : undefined,
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${sitePort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `cd site && ../node_modules/.bin/react-router dev --port ${sitePort}`,
    port: sitePort,
    reuseExistingServer: false,
  },
});
