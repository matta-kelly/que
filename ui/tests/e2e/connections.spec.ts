import { test, expect } from "@playwright/test";
import { openApp } from "./helpers";

// Needs Odoo connected for the dev user (it checks Odoo shows "Connected").

// Settings → Connections lists plugins that need a credential and whether
// this user has connected them. Saving is validated server-side (the harness
// test-connects first), so a bad credential is rejected and nothing changes.
test("connections: odoo shows connected; bad credential is rejected @live", async ({
  page,
}) => {
  await openApp(page);
  await page.locator('[data-slot="nav-user"]').click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Connections", exact: true })
    .click();
  const odoo = page.getByTestId("connection-odoo");
  await expect(odoo).toContainText("Odoo");
  await expect(odoo).toContainText("Connected");

  await odoo.getByRole("button", { name: "Update" }).click();
  await odoo.getByLabel("URL").fill("http://127.0.0.1:9");
  await odoo.getByLabel("Database").fill("x");
  await odoo.getByLabel("Login").fill("x");
  await odoo.getByLabel("API key").fill("x");
  await odoo.getByRole("button", { name: "Save" }).click();

  await expect(odoo.getByRole("alert")).toContainText(
    /unreachable|login failed/i,
  );
  await page.reload();
  await page.locator('[data-slot="nav-user"]').click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Connections", exact: true })
    .click();
  await expect(page.getByTestId("connection-odoo")).toContainText("Connected");
});
