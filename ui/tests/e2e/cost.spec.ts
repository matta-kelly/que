import { test, expect, type Page } from "@playwright/test";
import { nameNewestChat, openApp, openChat } from "./helpers";

// Needs a deployment that lists two models of two prices, on a server that
// gives each model's price.

type Price = { input: number; output: number; cachedInput?: number };
type Deployment = {
  agents: { name: string; model: string }[];
  models: { name: string; price: Price }[];
};

async function deploymentOf(page: Page): Promise<Deployment> {
  const res = await page.request.get("/api/que/deployment");
  expect(res.ok()).toBe(true);
  return res.json();
}

// A price as the UI writes it, for one million tokens.
const priced = ({ input, output }: Price) =>
  `$${input.toFixed(2)} in · $${output.toFixed(2)} out`;
// A cost as the UI writes it.
const COST = /(<\$0\.0001|\$\d+\.\d{2,4})/;

const meter = (page: Page) => page.locator('[data-slot="context-meter"]');
const replyUsage = (page: Page) => page.locator('[data-slot="reply-usage"]');
const tooltip = (page: Page) => page.getByRole("tooltip");

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

test("cost: each model in the picker shows its price", async ({ page }) => {
  await openApp(page);
  const { models } = await deploymentOf(page);
  await page.getByRole("button", { name: "Model" }).click();
  for (const model of models)
    // The row is still found by the model's name alone.
    await expect(
      page.getByRole("menuitemradio", { name: model.name, exact: true }),
    ).toContainText(priced(model.price));
});

test("cost: a reply shows what it cost, and the meter what the chat cost", async ({
  page,
}) => {
  await openApp(page);
  const { agents, models } = await deploymentOf(page);
  const model = models.find((m) => m.name === agents[0].model)!;
  await send(page, "Say hi in one word.");

  // The cost is last on the line under the reply.
  await expect(replyUsage(page)).toHaveText(
    new RegExp(`^${model.name} · .* in · .* out · ${COST.source}$`),
  );
  // Its hover says it is an estimate, and the price it was counted at.
  await replyUsage(page).hover();
  await expect(tooltip(page)).toContainText(/estimate/i);
  await expect(tooltip(page)).toContainText(priced(model.price));

  await page.mouse.move(0, 0);
  await meter(page).hover();
  await expect(tooltip(page)).toContainText(
    new RegExp(`this chat: about ${COST.source}`),
  );
});

test("cost: a reply on another model is at that model's price", async ({
  page,
}) => {
  await openApp(page);
  const { agents, models } = await deploymentOf(page);
  const first = models.find((m) => m.name === agents[0].model)!;
  const other = models.find((m) => m.price.input !== first.price.input)!;

  await send(page, "Say hi in one word.");
  await page.getByRole("button", { name: "Model" }).click();
  await page
    .getByRole("menuitemradio", { name: other.name, exact: true })
    .click();
  await send(page, "Say bye in one word.");

  await replyUsage(page).first().hover();
  await expect(tooltip(page)).toContainText(priced(first.price));
  await page.mouse.move(0, 0);
  await replyUsage(page).last().hover();
  await expect(tooltip(page)).toContainText(priced(other.price));
});

test("cost: a chat opened again shows the same costs", async ({ page }) => {
  await openApp(page);
  await send(page, "Say hi in one word.");
  const reply = await replyUsage(page).textContent();
  expect(reply).toMatch(COST);
  await meter(page).hover();
  const total = (await tooltip(page).textContent())!.match(
    /this chat: about \S+/,
  )![0];
  const title = `Cost ${Date.now()}`;
  await nameNewestChat(page, title);

  await page.reload();
  await expect(page.locator('[data-slot="nav-user"]')).toBeVisible();
  await openChat(page, title);
  await expect(replyUsage(page)).toHaveText(reply!);
  await meter(page).hover();
  await expect(tooltip(page)).toContainText(total);
});
