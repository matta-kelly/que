import { defineConfig } from "@playwright/test";

// Drives the real UI in a browser. Expects `npm run server` and `npm run ui`
// to already be running (from que/).
export default defineConfig({
  testDir: "tests",
  timeout: 120_000,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  reporter: "list",
});
