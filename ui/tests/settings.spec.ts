import { test, expect } from "@playwright/test";
import { openApp } from "./helpers";

// Settings opens on Home: a search box over section tiles. Search filters the
// tiles and finds things inside sections (a connector, a person).
test("settings: home tiles and search into sections", async ({ page }) => {
  await openApp(page);
  await page.locator('[data-slot="nav-user"]').click();
  const dialog = page.getByRole("dialog");
  const search = dialog.getByRole("searchbox", { name: "Search settings" });
  await expect(search).toBeFocused();
  for (const id of ["account", "connections", "users"]) await expect(dialog.getByTestId(`settings-tile-${id}`)).toBeVisible();

  await search.fill("odoo");
  await expect(dialog.getByTestId("settings-tile-account")).toHaveCount(0);
  await dialog.getByRole("button", { name: /Odoo connection/ }).click();
  await expect(dialog.getByTestId("connection-odoo")).toBeVisible();

  await dialog.getByRole("button", { name: "Home", exact: true }).click();
  await dialog.getByRole("searchbox", { name: "Search settings" }).fill("dev@que.local");
  await dialog.getByRole("button", { name: /Users · dev@que.local/ }).click();
  await expect(dialog.getByTestId("user-dev@que.local")).toBeVisible();

  await dialog.getByRole("button", { name: "Home", exact: true }).click();
  await dialog.getByRole("searchbox", { name: "Search settings" }).fill("zzz-nothing");
  await expect(dialog.getByText(/No settings match/)).toBeVisible();
});
