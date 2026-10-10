import { test, expect } from "@playwright/test";
import { openApp } from "./helpers";

// The header toggle switches between light and dark, and the choice sticks
// across reloads.
test("theme: toggle switches light/dark and persists", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openApp(page);
  const html = page.locator("html");
  await expect(html).not.toHaveClass(/dark/);
  await page.screenshot({
    path: "test-results/theme-light.png",
    clip: { x: 0, y: 0, width: 1280, height: 400 },
  });

  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(html).toHaveClass(/dark/);
  await page.screenshot({
    path: "test-results/theme-dark.png",
    clip: { x: 0, y: 0, width: 1280, height: 400 },
  });

  await page.reload();
  await expect(html).toHaveClass(/dark/);
});
