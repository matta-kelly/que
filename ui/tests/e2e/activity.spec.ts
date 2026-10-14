import { test, expect } from "@playwright/test";
import { openApp } from "./helpers";

// Needs Odoo connected for the dev user (the agent searches it).

// A turn's thinking/tool steps fold into one summary row, collapsed by
// default; clicking it shows the steps.
test("activity: steps are collapsed under a summary row @live", async ({
  page,
}) => {
  await openApp(page);
  const input = page.getByPlaceholder("Send a message...");
  await input.fill(
    "Search Odoo for companies with 'a' in the name and tell me how many there are.",
  );
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible({
    timeout: 60_000,
  });

  const summary = page.getByRole("button", { name: "Show steps" }).last();
  await expect(summary).toContainText(/\d+ steps?/);
  await expect(page.getByText(/Odoo: find partners/)).toBeHidden();
  await summary.click();
  await expect(page.getByText(/Odoo: find partners/).first()).toBeVisible();
});
