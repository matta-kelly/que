import { test, expect } from "@playwright/test";
import { openApp, openChats } from "./helpers";

test("sidebar: search turns the chats row into a search field", async ({
  page,
}) => {
  await openApp(page);
  const search = page.getByRole("searchbox", { name: "Search threads" });
  await expect(search).toHaveCount(0);
  await page.getByRole("button", { name: "Search chats" }).click();
  await expect(search).toBeFocused();
  await expect(page.getByRole("button", { name: "Toggle chats" })).toHaveCount(
    0,
  );
  await search.fill("zzz-no-such-chat");
  await expect(
    page.locator('[data-slot="aui_thread-list-item-title"]'),
  ).toHaveCount(0);
  await search.press("Escape");
  await expect(search).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Toggle chats" }),
  ).toBeVisible();
});

test("sidebar: drag the edge to resize, within limits, remembered", async ({
  page,
}) => {
  await openApp(page);
  const sidebar = page.locator('[data-slot="sidebar-container"]');
  const handle = page.getByRole("separator", { name: "Resize sidebar" });
  await expect(handle).toBeVisible();
  const box = (await handle.boundingBox())!;
  const y = box.y + box.height / 2;

  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(340, y, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => Math.round((await sidebar.boundingBox())!.width))
    .toBe(340);

  // Beyond the max, it stops at 400.
  const box2 = (await handle.boundingBox())!;
  await page.mouse.move(box2.x + box2.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(700, y, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => Math.round((await sidebar.boundingBox())!.width))
    .toBe(400);

  await page.reload();
  await expect
    .poll(async () => Math.round((await sidebar.boundingBox())!.width))
    .toBe(400);
  await page.evaluate(() => localStorage.removeItem("que.sidebarWidth"));
});

test("sidebar: closing search restores the chats section's collapsed state", async ({
  page,
}) => {
  await openApp(page);
  const threadList = page.locator('[data-slot="aui_thread-list-items"]');
  await expect(threadList).toBeHidden();

  await page.getByRole("button", { name: "Search chats" }).click();
  await expect(threadList).toBeVisible();
  await page.getByRole("searchbox", { name: "Search threads" }).press("Escape");
  await expect(threadList).toBeHidden();

  await page.getByRole("button", { name: "Search chats" }).click();
  await page.getByRole("button", { name: "Close search" }).click();
  await expect(threadList).toBeHidden();
});

test("sidebar: chats section starts collapsed and remembers your choice", async ({
  page,
}) => {
  await openApp(page);
  const threadList = page.locator('[data-slot="aui_thread-list-items"]');
  await expect(threadList).toBeHidden();

  await openChats(page);
  await page.reload();
  await expect(threadList).toBeVisible();

  await page.getByRole("button", { name: "Toggle chats" }).click();
  await page.reload();
  await expect(page.locator('[data-slot="nav-user"]')).toBeVisible();
  await expect(threadList).toBeHidden();
});

test("sidebar: Chats, rail icon and brand open a fresh chat", async ({
  page,
}) => {
  const freshChat = async () => {
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('[data-slot="page-title"]')).toHaveText(
      "New chat",
    );
  };
  await openApp(page, "/reports");
  await expect(page.getByText("No reports yet")).toBeVisible();
  await page.getByRole("button", { name: "Chats", exact: true }).click();
  await freshChat();

  await page.getByRole("link", { name: "Workflows", exact: true }).click();
  await page.getByRole("button", { name: /Lotus and Luna/ }).click();
  await freshChat();

  await page.getByRole("link", { name: "Skills", exact: true }).click();
  await page
    .locator('[data-sidebar="footer"]')
    .getByRole("button", { name: "Toggle Sidebar" })
    .click();
  await page.getByRole("button", { name: "Chats", exact: true }).click();
  await freshChat();
});
