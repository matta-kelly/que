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
  for (const id of ["account", "connections", "users"])
    await expect(dialog.getByTestId(`settings-tile-${id}`)).toBeVisible();

  await search.fill("shelf");
  await expect(dialog.getByTestId("settings-tile-account")).toHaveCount(0);
  await dialog.getByRole("button", { name: /Shelf connection/ }).click();
  await expect(dialog.getByTestId("connection-shelf")).toBeVisible();

  await dialog.getByRole("button", { name: "Home", exact: true }).click();
  await dialog
    .getByRole("searchbox", { name: "Search settings" })
    .fill("dev@que.local");
  await dialog.getByRole("button", { name: /Users · dev@que.local/ }).click();
  await expect(dialog.getByTestId("user-dev@que.local")).toBeVisible();

  await dialog.getByRole("button", { name: "Home", exact: true }).click();
  await dialog
    .getByRole("searchbox", { name: "Search settings" })
    .fill("zzz-nothing");
  await expect(dialog.getByText(/No settings match/)).toBeVisible();
});

// Needs a deployment with no DEV_USER_INSTRUCTIONS: the box is the account's.
test("settings: instructions saved in Account are in the box after a reload", async ({
  page,
}) => {
  const account = async () => {
    await openApp(page);
    await page.locator('[data-slot="nav-user"]').click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Account", exact: true }).click();
    return dialog;
  };
  let dialog = await account();
  try {
    await dialog.getByLabel("Instructions").fill("No emojis.\nBe terse.");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Saved")).toBeVisible();

    dialog = await account();
    await expect(dialog.getByLabel("Instructions")).toHaveValue(
      "No emojis.\nBe terse.",
    );
  } finally {
    // No other test's chat runs with this text.
    await page.request.patch("/api/que/me", { data: { instructions: "" } });
  }
});
