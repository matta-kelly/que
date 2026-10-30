import { expect, type Page } from "@playwright/test";

// Open a page (the chat by default) and wait until the app has loaded: the
// signed-in user shows at the bottom of the sidebar.
export async function openApp(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.locator('[data-slot="nav-user"]')).toBeVisible();
}

// The Chats section starts collapsed; expand it when a test needs the list.
export async function openChats(page: Page) {
  await expect(
    page.getByRole("button", { name: "Toggle chats" }),
  ).toBeVisible();
  const list = page.locator('[data-slot="aui_thread-list-items"]');
  if (!(await list.isVisible()))
    await page.getByRole("button", { name: "Toggle chats" }).click();
  await expect(list).toBeVisible();
}

// Start a new chat from the command palette.
export async function newChat(page: Page) {
  await page.locator("header").click();
  await page.keyboard.press("Control+k");
  await page.getByRole("option", { name: "New chat", exact: true }).click();
}

// Give the chat just made a title no other chat has, so a test can open it
// again by name: its place in the list is not its own when another session
// makes chats on the same server.
export async function nameNewestChat(page: Page, title: string) {
  await openChats(page);
  const items = page.locator('[data-slot="aui_thread-list-items"]');
  await items.getByRole("button", { name: "More options" }).first().click();
  await page.getByRole("menuitem", { name: /rename/i }).click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
  await expect(items).toContainText(title);
}

export async function openChat(page: Page, title: string) {
  await openChats(page);
  await page
    .locator('[data-slot="aui_thread-list-item"]', { hasText: title })
    .locator('[data-slot="aui_thread-list-item-trigger"]')
    .click();
  await expect(page.locator('[data-slot="page-title"]')).toHaveText(title);
}

/**
 * Open the chat whose first message is `text`. A chat has no title of its own
 * yet (F3), so each chat at the top of the list is opened until one is it.
 */
export async function openChatWith(page: Page, text: string) {
  await openChats(page);
  const items = page.locator('[data-slot="aui_thread-list-item"]');
  const sent = page.locator('[data-role="user"]', { hasText: text });
  const count = Math.min(await items.count(), 10);
  for (let i = 0; i < count; i++) {
    await items
      .nth(i)
      .locator('[data-slot="aui_thread-list-item-trigger"]')
      .click();
    // isVisible does not wait: the chat's messages load after the click.
    const loaded = await expect(sent.first())
      .toBeVisible({ timeout: 5_000 })
      .then(
        () => true,
        () => false,
      );
    if (loaded) return;
  }
  throw new Error(`no chat near the top of the list holds "${text}"`);
}
