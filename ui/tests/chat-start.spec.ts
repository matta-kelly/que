import { test, expect } from "@playwright/test";
import { openApp } from "./helpers";

// A new chat shows que-specific starting suggestions; clicking one fills the
// message box (so an Odoo id can be added) instead of sending.
test("chat: header says New chat; suggestions fill the composer", async ({ page }) => {
  await openApp(page);
  await expect(page.locator('[data-slot="page-title"]')).toHaveText("New chat");
  await page.getByRole("button", { name: /Look up a customer company/ }).click();
  const composer = page.getByPlaceholder("Send a message...");
  await expect(composer).toHaveValue("Look up the customer company with Odoo id ");
  // Filled, not sent: no message in the thread yet.
  await expect(page.locator('[data-role="user"]')).toHaveCount(0);
});
