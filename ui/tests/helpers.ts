import { expect, type Page } from "@playwright/test";

// Open a page (the chat by default) and wait until the app has loaded: the
// signed-in user shows at the bottom of the sidebar.
export async function openApp(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.locator('[data-slot="nav-user"]')).toBeVisible();
}

// The Chats section starts collapsed; expand it when a test needs the list.
export async function openChats(page: Page) {
  await expect(page.getByRole("button", { name: "Toggle chats" })).toBeVisible();
  const list = page.locator('[data-slot="aui_thread-list-items"]');
  if (!(await list.isVisible())) await page.getByRole("button", { name: "Toggle chats" }).click();
  await expect(list).toBeVisible();
}
