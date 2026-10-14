import { test, expect, type Page } from "@playwright/test";
import { openApp, openChats } from "./helpers";

// Chats live on the LangGraph server: a renamed chat keeps its title after a
// reload.
test("threads: rename persists across reload @live", async ({ page }) => {
  const title = `Renamed ${Date.now()}`;
  await openApp(page);
  const input = page.getByPlaceholder("Send a message...");
  await input.fill("Say hi.");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible({
    timeout: 60_000,
  });

  await openChats(page);
  const items = page.locator('[data-slot="aui_thread-list-items"]');
  await items.getByRole("button", { name: "More options" }).first().click();
  await page.getByRole("menuitem", { name: /rename/i }).click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
  // Shows right away (saved in the background), no gap while the server saves.
  await expect(items).toContainText(title, { timeout: 500 });
  // The chat page's header shows the current chat's title.
  await expect(page.locator('[data-slot="page-title"]')).toHaveText(title);

  await page.reload();
  await openChats(page);
  await expect(
    page.locator('[data-slot="aui_thread-list-items"]'),
  ).toContainText(title, { timeout: 15_000 });
});

// Make a chat with a unique title: new chat (palette), send a message, rename.
async function createChat(page: Page, title: string) {
  await page.locator("header").click();
  await page.keyboard.press("Control+k");
  await page.getByRole("option", { name: "New chat", exact: true }).click();
  const input = page.getByPlaceholder("Send a message...");
  await input.fill("Say hi.");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible({
    timeout: 60_000,
  });
  await openChats(page);
  const items = page.locator('[data-slot="aui_thread-list-items"]');
  await items.getByRole("button", { name: "More options" }).first().click();
  await page.getByRole("menuitem", { name: /rename/i }).click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
  await expect(items).toContainText(title);
}

for (const action of ["archive", "delete"] as const) {
  test(`chats: select several and ${action} them @live`, async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    const stamp = Date.now();
    const a = `Bulk ${action} A ${stamp}`;
    const b = `Bulk ${action} B ${stamp}`;
    await openApp(page);
    await createChat(page, a);
    await createChat(page, b);

    const items = page.locator('[data-slot="aui_thread-list-items"]');
    const row = (t: string) =>
      page.locator('[data-slot="aui_thread-list-item"]', { hasText: t });
    await row(a).hover();
    await row(a).getByRole("button", { name: "More options" }).click();
    await page.getByRole("menuitem", { name: "Select" }).click();
    await expect(page.getByText("1 selected")).toBeVisible();
    await row(b).getByRole("checkbox").click();
    await expect(page.getByText("2 selected")).toBeVisible();

    await page
      .getByRole("button", {
        name: action === "archive" ? "Archive selected" : "Delete selected",
      })
      .click();
    await expect(items).not.toContainText(a);
    await expect(items).not.toContainText(b);
    await expect(page.getByText(/selected$/)).toHaveCount(0);

    await page.reload();
    await openChats(page);
    await expect(items).not.toContainText(a);
    await expect(items).not.toContainText(b);
  });
}

// "Chats", the collapsed-rail chats icon, and the Lotus and Luna brand all open
// a fresh chat on the chat page.
