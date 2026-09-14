import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "phase21-native-static.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3310",
    trace: "on-first-retry",
  },
  projects: [{
    name: "chromium",
    use: {
      ...devices["Pixel 7"],
      channel: "chrome",
    },
  }],
  webServer: {
    command: "node scripts/serve-native-static.mjs",
    url: "http://127.0.0.1:3310",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});