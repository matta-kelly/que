import { test, expect, type Page } from "@playwright/test";
import { nameNewestChat, openApp, openChat } from "./helpers";
import { short } from "../../lib/usage.ts";

// Needs a deployment that lists two models or more, with two windows.

type Deployment = {
  agents: { name: string; model: string }[];
  models: { name: string; window: number }[];
};

async function deploymentOf(page: Page): Promise<Deployment> {
  const res = await page.request.get("/api/que/deployment");
  expect(res.ok()).toBe(true);
  return res.json();
}

const meter = (page: Page) => page.locator('[data-slot="context-meter"]');
const replyUsage = (page: Page) => page.locator('[data-slot="reply-usage"]');

async function send(page: Page, text: string) {
  const replies = page.locator('[data-role="assistant"]');
  const before = await replies.count();
  const input = page.getByPlaceholder("Send a message...");
  await input.fill(text);
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(replies).toHaveCount(before + 1);
  await expect(page.locator(".aui-message-error-root")).toHaveCount(0);
}

async function pickModel(page: Page, name: string) {
  await page.getByRole("button", { name: "Model" }).click();
  await page.getByRole("menuitemradio", { name, exact: true }).click();
}

test("usage: a new chat has no meter, and a chat with a reply has one", async ({
  page,
}) => {
  await openApp(page);
  const { agents, models } = await deploymentOf(page);
  const model = models.find((m) => m.name === agents[0].model)!;
  await expect(page.getByRole("button", { name: "Model" })).toBeVisible();
  await expect(meter(page)).toHaveCount(0);

  await send(page, "Say hi in one word.");
  await expect(meter(page)).toHaveText(
    new RegExp(`^[\\d.]+[kM]? / ${short(model.window)}$`),
  );
  // The reply says what it took, and the model that gave it.
  await expect(replyUsage(page)).toHaveText(
    new RegExp(`^${model.name} · [\\d.]+[kM]? in · [\\d.]+[kM]? out$`),
  );
});

test("usage: a reply on another model shows that model, and the meter its window", async ({
  page,
}) => {
  await openApp(page);
  const { agents, models } = await deploymentOf(page);
  const first = models.find((m) => m.name === agents[0].model)!;
  const other = models.find((m) => m.window !== first.window)!;

  await send(page, "Say hi in one word.");
  await pickModel(page, other.name);
  // The same tokens, over the window of the model picked.
  await expect(meter(page)).toContainText(`/ ${short(other.window)}`);

  await send(page, "Say bye in one word.");
  await expect(replyUsage(page)).toHaveCount(2);
  await expect(replyUsage(page).first()).toContainText(first.name);
  await expect(replyUsage(page).last()).toContainText(other.name);
});

test("usage: a chat opened again shows the same meter and reply info", async ({
  page,
}) => {
  await openApp(page);
  await send(page, "Say hi in one word.");
  const meterText = await meter(page).textContent();
  const replyText = await replyUsage(page).textContent();
  const title = `Usage ${Date.now()}`;
  await nameNewestChat(page, title);

  await page.reload();
  await expect(page.locator('[data-slot="nav-user"]')).toBeVisible();
  await openChat(page, title);
  await expect(meter(page)).toHaveText(meterText!);
  await expect(replyUsage(page)).toHaveText(replyText!);
});
