import { test, expect } from "@playwright/test";
import { openApp } from "./helpers";

// Loading an area page directly stays on it (the app must not bounce to chat
// while it settles the initial chat).
test("areas: direct load of a page stays on it", async ({ page }) => {
  await openApp(page, "/skills");
  await expect(page.getByText("No custom skills yet")).toBeVisible();
  // Nothing on this page marks the initial chat as settled, so give a bounce
  // time to happen before checking the URL.
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/skills$/);
  await page.getByRole("button", { name: "Create skill" }).click();
  await expect(
    page.getByText("Create skill is currently unavailable"),
  ).toBeVisible();
});

// Clicking a chat in the sidebar from another page goes to the chat, even
// the chat that's already the current one.
test("areas: clicking a sidebar chat from a page opens the chat", async ({
  page,
}) => {
  await openApp(page, "/reports");
  await expect(page.getByText("No reports yet")).toBeVisible();
  const chats = page.getByRole("button", { name: "Toggle chats" });
  const list = page.locator('[data-slot="aui_thread-list-items"]');
  if (!(await list.isVisible())) await chats.click();
  const rows = page.locator('[data-slot="aui_thread-list-item-trigger"]');
  await rows.first().click();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await rows.first().click();
  await expect(page).toHaveURL(/\/$/);
});
