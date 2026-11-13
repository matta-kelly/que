import { test, expect } from "@playwright/test";
import { openApp } from "./helpers";

// Settings is the app's one page, and it opens on Home: a search box over
// section tiles. Search filters the tiles and finds things inside sections (a
// connector, a person).
test("settings: home tiles and search into sections", async ({ page }) => {
  await openApp(page);
  const title = page.locator('[data-slot="page-title"]');
  await expect(title).toHaveText("Settings");
  const search = page.getByRole("searchbox", { name: "Search settings" });
  await expect(search).toBeFocused();
  for (const id of ["account", "connections", "users"])
    await expect(page.getByTestId(`settings-tile-${id}`)).toBeVisible();

  await search.fill("odoo");
  await expect(page.getByTestId("settings-tile-account")).toHaveCount(0);
  await page.getByRole("button", { name: /Odoo connection/ }).click();
  await expect(page.getByTestId("connection-odoo")).toBeVisible();

  await page
    .locator('[data-sidebar="content"]')
    .getByRole("button", { name: "Home", exact: true })
    .click();
  await expect(title).toHaveText("Settings");
  await page
    .getByRole("searchbox", { name: "Search settings" })
    .fill("dev@que.local");
  await page.getByRole("button", { name: /Users · dev@que.local/ }).click();
  await expect(page.getByTestId("user-dev@que.local")).toBeVisible();

  await page.getByRole("button", { name: "Lotus and Luna: home" }).click();
  await page
    .getByRole("searchbox", { name: "Search settings" })
    .fill("zzz-nothing");
  await expect(page.getByText(/No settings match/)).toBeVisible();
});
