import { test, expect } from "@playwright/test";
import { openApp } from "./helpers";

// The signed-in user (the dev identity) shows at the bottom of the sidebar;
// clicking it opens Settings; Account is where the name is editable. Settings →
// Users lists everyone.
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
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Account", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Account" })).toBeVisible();
  const name = dialog.getByLabel("Name");

  await name.fill("Renamed Tester");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Saved")).toBeVisible();
  await expect(navUser).toContainText("Renamed Tester");

  await name.fill(original);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(navUser).toContainText(original);
});

test("users: settings lists users with roles", async ({ page }) => {
  await openApp(page);
  await page.locator('[data-slot="nav-user"]').click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Users", exact: true }).click();
  await expect(dialog.getByTestId("user-dev@que.local")).toContainText("admin");
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
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Account", exact: true }).click();
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png });
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Saved")).toBeVisible();
  await expect(navUser.locator("img")).toHaveAttribute(
    "src",
    /^data:image\/webp/,
  );

  await dialog.getByRole("button", { name: "Remove" }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(navUser.locator("img")).toHaveCount(0);
});

// Needs a deployment with no DEV_USER_INSTRUCTIONS, so the text can be saved.
test("users: the list of users carries the instructions of nobody", async ({
  page,
}) => {
  await openApp(page);
  try {
    const saved = await page.request.patch("/api/que/me", {
      data: { instructions: "Only I read this." },
    });
    expect(saved.ok()).toBe(true);
    const list = await page.request.get("/api/que/users");
    expect(list.ok()).toBe(true);
    expect(await list.text()).not.toContain("Only I read this.");
  } finally {
    await page.request.patch("/api/que/me", { data: { instructions: "" } });
  }
});
