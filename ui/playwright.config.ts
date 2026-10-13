import { defineConfig } from "@playwright/test";

// Drives the real UI in a browser, against the que that is up. A test with
// `@live` in its title checks the real model or a real service: `just
// test-live` runs those, and `just test` runs each other one on the test
// deployment (server/tests/integration/browser).
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  reporter: "list",
});
