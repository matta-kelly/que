import { test, expect } from "@playwright/test";
import { openApp } from "./helpers";

// The signed-in user (the dev identity) shows at the bottom of the sidebar;
// clicking it opens Account, where the name is editable.
test("users: sidebar shows me; editing my name updates it", async ({
  page,
}) => {
  await openApp(page);
  const navUser = page.locator('[data-slot="nav-user"]');
  await expect(navUser).toContainText("dev@que.local");
  const original = (
    await navUser.locator("span.font-medium").innerText()
  ).trim();

  await navUser.click();
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
  const name = page.getByLabel("Name");

  await name.fill("Renamed Tester");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await expect(navUser).toContainText("Renamed Tester");

  await name.fill(original);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(navUser).toContainText(original);
});

// Uploading a picture crops/shrinks it in the browser to a small WebP and
// shows it in the sidebar; Remove goes back to initials.
test("users: upload and remove a profile picture", async ({ page }) => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  await openApp(page);
  const navUser = page.locator('[data-slot="nav-user"]');
  await navUser.click();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await expect(navUser.locator("img")).toHaveAttribute(
    "src",
    /^data:image\/webp/,
  );

  await page.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(navUser.locator("img")).toHaveCount(0);
});
