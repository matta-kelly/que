import { expect, type Page } from "@playwright/test";

// Open the app and wait until it has loaded: the signed-in user shows at the
// bottom of the sidebar.
export async function openApp(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.locator('[data-slot="nav-user"]')).toBeVisible();
}

// Open a settings section from the sidebar, and wait until the page shows it.
export async function openSection(page: Page, name: string) {
  await page
    .locator('[data-sidebar="content"]')
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.locator('[data-slot="page-title"]')).toHaveText(name);
}
