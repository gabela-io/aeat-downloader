import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./test/browser",
  timeout: 60000,
  workers: 1,
  reporter: "list",
  outputDir: "test-results",
});
