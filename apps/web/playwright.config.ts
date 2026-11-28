import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against `next dev` with the Firebase Emulator Suite and the mock AI provider.
 * Start emulators first: `npm run emulators`, then `node scripts/seed-emulator.mjs <owner email>`.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  // One `next dev` server compiles routes on demand; more workers just cause timeouts.
  workers: 2,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: "http://localhost:3000/api/health", reuseExistingServer: true, timeout: 120_000 },
});
