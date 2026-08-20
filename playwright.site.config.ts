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
    // Serve the built client, not the dev server: these specs assert
    // prerendered routes and deployed navigation, and Vite's dev-time
    // dependency optimizer re-runs when route prefetching discovers a
    // documentation component, invalidating already-served module URLs with
    // 504 "Outdated Optimize Dep". `pnpm check` builds before this stage.
    command: `cd site && ../node_modules/.bin/vite preview --port ${sitePort} --strictPort`,
    port: sitePort,
    reuseExistingServer: false,
  },
});
