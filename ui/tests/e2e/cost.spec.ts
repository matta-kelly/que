import { test, expect, type Page } from "@playwright/test";
import { nameNewestChat, openApp, openChat } from "./helpers";
import { money } from "../../components/chat/usage/cost.ts";

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

// A price as the UI writes it, for one million tokens: each digit the server gave, and
// two decimals at the least. Written here apart from the UI's own code, from the number as JSON has it.
const rate = (dollars: number) => {
  const [whole, decimals = ""] = String(dollars).split(".");
  return `$${whole}.${decimals.padEnd(2, "0")}`;
};
const priced = ({ input, output }: Price) =>
  `${rate(input)} in · ${rate(output)} out`;
// A cost as the UI writes it.
const COST = /(<\$0\.0001|\$\d+\.\d{2,4})/;

const meter = (page: Page) => page.locator('[data-slot="context-meter"]');
const chatCost = (page: Page) => page.locator('[data-slot="context-cost"]');
const replyUsage = (page: Page) => page.locator('[data-slot="reply-usage"]');
// The one that is open: a hover that has ended leaves its own for a moment, as it closes.
const tooltip = (page: Page) =>
  page.locator('[data-slot="tooltip-content"]:not([data-state="closed"])');

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

test("cost: a reply shows what it cost, and the ring what the chat cost @live", async ({
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

  // The amount is the tokens the hover gives, at the price the server gives. One model call made this reply.
  const said = (await tooltip(page).textContent())!.replaceAll(",", "");
  const [, tokensIn, cached, tokensOut] = said
    .match(/(\d+) in \((\d+) cached\) · (\d+) out/)!
    .map(Number);
  const { input, output, cachedInput = input } = model.price;
  const cost =
    ((tokensIn - cached) * input + cached * cachedInput + tokensOut * output) /
    1_000_000;
  await expect(replyUsage(page)).toContainText(` · ${money(cost)}`);

  // The panel of the ring has the same call, in its three parts: it is the chat's last one.
  const panel = (await meter(page).textContent())!.replaceAll(",", "");
  const part = (label: string) =>
    Number(panel.match(new RegExp(`${label}(\\d+)`))![1]);
  expect(part("Cached")).toBe(cached);
  expect(part("New")).toBe(tokensIn - cached);
  expect(part("Reply")).toBe(tokensOut);

  // The cost of the chat is beside the ring, with no hover: one reply so far, so it is that reply's cost.
  await expect(chatCost(page)).toHaveText(money(cost));
  // The panel of the ring says it too, as the estimate it is.
  await expect(meter(page)).toContainText(
    /This chat(about \$\d+\.\d{2,4}|under \$0\.0001)/,
  );
});

test("cost: a chat opened again shows the same costs @live", async ({
  page,
}) => {
  await openApp(page);
  await send(page, "Say hi in one word.");
  const reply = await replyUsage(page).textContent();
  expect(reply).toMatch(COST);
  const total = await chatCost(page).textContent();
  expect(total).toMatch(COST);
  const title = `Cost ${Date.now()}`;
  await nameNewestChat(page, title);

  await page.reload();
  await expect(page.locator('[data-slot="nav-user"]')).toBeVisible();
  await openChat(page, title);
  await expect(replyUsage(page)).toHaveText(reply!);
  await expect(chatCost(page)).toHaveText(total!);
});
