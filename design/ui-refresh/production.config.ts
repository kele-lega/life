import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";

// Run against `npm run start -- --port 3101` to catch production CSS ordering.
export default defineConfig({
  ...base,
  testDir: "../../e2e",
  testMatch: ["home-ui.spec.ts", "stateful-button.spec.ts"],
  outputDir: "../../test-results/production-ui",
  webServer: undefined,
  use: { ...base.use, baseURL: "http://127.0.0.1:3101" },
});
