import { test, expect } from "@playwright/test";
import { openApp } from "./helpers";

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
