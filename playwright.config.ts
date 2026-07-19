import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 4178);

export default defineConfig({
  testDir: "tests/e2e",
  testIgnore: /homepage\.spec\.ts/,
  timeout: 30_000,
  workers: process.env.CI ? 1 : undefined,
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "node scripts/serve-viewer.mjs",
    port,
    reuseExistingServer: false,
  },
});
