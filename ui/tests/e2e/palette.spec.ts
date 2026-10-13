import { test, expect } from "@playwright/test";
import { openApp } from "./helpers";

// The command palette searches everything: actions, pages, settings (incl.
// each connector), and chats. "/" or Ctrl/⌘+K opens it.
test("palette: / opens it and finds a connector that opens settings", async ({
  page,
}) => {
  await openApp(page);
  await page.locator('[data-slot="page-title"]').click();
  await page.keyboard.press("/");
  const input = page.getByPlaceholder("Search everything…");
  await expect(input).toBeFocused();

  await input.fill("shelf");
  await expect(
    page.getByRole("option", { name: /Shelf connection/ }),
  ).toBeVisible();
  await page.keyboard.press("Enter");

  await expect(input).toHaveCount(0);
  await expect(
    page.getByRole("dialog").getByTestId("connection-shelf"),
  ).toBeVisible();
});

test("palette: Ctrl+K toggles it; / in the message box doesn't open it", async ({
  page,
}) => {
  await openApp(page);
  const input = page.getByPlaceholder("Search everything…");
  await page.locator('[data-slot="page-title"]').click();
  await page.keyboard.press("Control+k");
  await expect(input).toBeVisible();
  await expect(page.getByRole("option", { name: /Reports/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /New chat/ })).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(input).toHaveCount(0);

  const composer = page.getByPlaceholder("Send a message...");
  await composer.click();
  await page.keyboard.type("a/b");
  await expect(composer).toHaveValue("a/b");
  await expect(input).toHaveCount(0);
});

// Scoped search: "chat:" scopes to chats (shown as a pill); Backspace on an
// empty search clears it; typing a type's name suggests "Search in …".
test("palette: scoped search with prefixes and suggestions", async ({
  page,
}) => {
  await openApp(page);
  await page.locator('[data-slot="page-title"]').click();
  await page.keyboard.press("/");
  const input = page.getByRole("combobox");
  const pill = page.locator('[data-slot="search-scope"]');

  await input.fill("chat:");
  await expect(pill).toHaveText("Chats");
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("placeholder", "Search chats…");
  await expect(page.getByRole("option", { name: /Reports/ })).toHaveCount(0);
  await expect(page.getByRole("option", { name: /New chat/ })).toHaveCount(0);
  await expect(page.getByRole("option").first()).toBeVisible();

  await input.press("Backspace");
  await expect(pill).toHaveCount(0);

  await input.fill("rep");
  await page.getByRole("option", { name: "Search in Reports" }).click();
  await expect(pill).toHaveText("Reports");
  await expect(page.getByRole("option", { name: "Reports" })).toBeVisible();
});
