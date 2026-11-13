import { test, expect } from "@playwright/test";
import { openApp } from "./helpers";

// The command palette searches everything: actions and settings (each section
// and each connector). "/" or Ctrl/⌘+K opens it.
test("palette: / opens it and finds a connector that opens its section", async ({
  page,
}) => {
  await openApp(page);
  await page.locator('[data-slot="page-title"]').click();
  await page.keyboard.press("/");
  const input = page.getByPlaceholder("Search everything…");
  await expect(input).toBeFocused();

  await input.fill("odoo");
  await expect(
    page.getByRole("option", { name: /Odoo connection/ }),
  ).toBeVisible();
  await page.keyboard.press("Enter");

  await expect(input).toHaveCount(0);
  await expect(page.locator('[data-slot="page-title"]')).toHaveText(
    "Connections",
  );
  await expect(page.getByTestId("connection-odoo")).toBeVisible();
});

test("palette: Ctrl+K toggles it; / in the settings search doesn't open it", async ({
  page,
}) => {
  await openApp(page);
  const input = page.getByPlaceholder("Search everything…");
  await page.locator('[data-slot="page-title"]').click();
  await page.keyboard.press("Control+k");
  await expect(input).toBeVisible();
  await expect(page.getByRole("option", { name: /theme/ })).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(input).toHaveCount(0);

  const search = page.getByRole("searchbox", { name: "Search settings" });
  await search.click();
  await page.keyboard.type("a/b");
  await expect(search).toHaveValue("a/b");
  await expect(input).toHaveCount(0);
});

// Scoped search: "settings:" scopes to settings (shown as a pill); Backspace on
// an empty search clears it; typing a type's name suggests "Search in …".
test("palette: scoped search with prefixes and suggestions", async ({
  page,
}) => {
  await openApp(page);
  await page.locator('[data-slot="page-title"]').click();
  await page.keyboard.press("/");
  const input = page.getByRole("combobox");
  const pill = page.locator('[data-slot="search-scope"]');

  await input.fill("settings:");
  await expect(pill).toHaveText("Settings");
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("placeholder", "Search settings…");
  await expect(page.getByRole("option", { name: /theme/ })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Account" })).toBeVisible();

  await input.press("Backspace");
  await expect(pill).toHaveCount(0);

  await input.fill("act");
  await page.getByRole("option", { name: "Search in Actions" }).click();
  await expect(pill).toHaveText("Actions");
});
